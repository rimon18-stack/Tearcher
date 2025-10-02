const fetch = require('node-fetch');

// Helper function to extract image URL from HTML
function extractImageUrl(html) {
  if (!html) return null;
  const match = html.match(/src=['"]([^'"]+)['"]/);
  return match ? `http://emis.gov.bd${match[1]}` : null;
}

// Helper function to format date
function formatDate(date) {
  if (!date) return '';
  return date.split('T')[0];
}

// Function to make parallel API calls
async function callApiParallel(urls, headers, dataArray = []) {
  if (!urls || urls.length === 0) {
    throw new Error("No URLs provided");
  }

  const requests = urls.map((url, index) => {
    if (!url) {
      throw new Error(`Empty API URL at index ${index}`);
    }

    const options = {
      method: dataArray[index] ? 'POST' : 'GET',
      headers: headers,
      timeout: 30000
    };

    if (dataArray[index]) {
      options.body = dataArray[index];
    }

    return fetch(url, options)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .catch(error => {
        console.error(`Error fetching ${url}:`, error);
        return { error: error.message };
      });
  });

  return Promise.all(requests);
}

// Main API handler
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      developer: "Tofazzal Hossain",
      error: "Method not allowed"
    });
  }

  // Get EIIN from query parameter
  const { eiin } = req.query;
  if (!eiin || !/^\d+$/.test(eiin)) {
    return res.status(400).json({
      ok: false,
      developer: "Tofazzal Hossain",
      error: "Invalid EIIN number"
    });
  }

  try {
    // Updated 1st API Call (Teacher Details)
    const firstApiUrl = "http://emis.gov.bd/emis/Portal/GetTeacherDetails";
    const firstApiHeaders = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-CSRF-TOKEN": "mrjDRy4u6JHn578J6O88Gk2XbIDuK5Riv-cCsEwX0jlzR0ZjKTP7FIJSw18kxpATi4BVakjqVYU2oKgi1nY82qWq1mv_hFeTgVmtJphZnZ81",
      "X-Requested-With": "XMLHttpRequest",
      "DNT": "1",
      "Origin": "http://emis.gov.bd",
      "Referer": "http://emis.gov.bd/EMIS/portal",
      "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
      "Cookie": "__RequestVerificationToken_L2VtaXM1=lfGK2t-Fn_2vCY9o269cAbtZs6gYtkmhLSM4_fU5eEAllxPkZDk6jEfcL_irK-zrppcxElkM6rDJRZeJEAi3iPVuubt07IeOtIPhP7H6Ocs1; CSRF-TOKEN=mrjDRy4u6JHn578J6O88Gk2XbIDuK5Riv-cCsEwX0jlzR0ZjKTP7FIJSw18kxpATi4BVakjqVYU2oKgi1nY82qWq1mv_hFeTgVmtJphZnZ81"
    };

    // Updated data format for first API
    const firstApiData = new URLSearchParams({
      'instituteId': '',
      'EIIN': eiin,
      'isTeacher': ''
    }).toString();

    const teacherDetailsResponse = await callApiParallel(
      [firstApiUrl], 
      firstApiHeaders, 
      [firstApiData]
    );

    if (!teacherDetailsResponse[0] || !Array.isArray(teacherDetailsResponse[0])) {
      return res.status(404).json({
        ok: false,
        developer: "Tofazzal Hossain",
        error: "No teacher data found for this EIIN"
      });
    }

    // Extract Teacher Data
    const teachers = teacherDetailsResponse[0];
    const empIds = [];
    const teacherData = {};

    teachers.forEach(teacher => {
      const empId = teacher.EmpId;
      if (!empId) return;

      empIds.push(empId);
      teacherData[empId] = {
        image: extractImageUrl(teacher.Image),
        designation: teacher.DesignationNameBn || 'N/A',
        district: teacher.DistrictName || 'N/A',
        subject: teacher.SubjectName || 'N/A',
        name: teacher.TeacherName || 'N/A',
        empId: empId
      };
    });

    if (empIds.length === 0) {
      return res.status(404).json({
        ok: false,
        developer: "Tofazzal Hossain",
        error: "No valid employee IDs found"
      });
    }

    // Updated 2nd API Call (Employee Info)
    const secondApiUrl = "http://emis.gov.bd/emis/services/HRM/Public/GetEmployeeInfo";
    const secondApiHeaders = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": "3qD1htkwe6CT6AHZnchO0Puc63a_FFgJ80lqW3BHyWvKeGRV5Hv5jGfmn0x_A895vEu9qB-wToYSGBTOX9Ih2EXIkE99swQh5yq_j_sZdG81",
      "X-Requested-With": "XMLHttpRequest",
      "DNT": "1",
      "Origin": "http://emis.gov.bd",
      "Referer": "http://emis.gov.bd/emis/HRM/ExistingEmployeeRegistration",
      "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
      "Cookie": "__RequestVerificationToken_L2VtaXM1=lfGK2t-Fn_2vCY9o269cAbtZs6gYtkmhLSM4_fU5eEAllxPkZDk6jEfcL_irK-zrppcxElkM6rDJRZeJEAi3iPVuubt07IeOtIPhP7H6Ocs1; CSRF-TOKEN=3qD1htkwe6CT6AHZnchO0Puc63a_FFgJ80lqW3BHyWvKeGRV5Hv5jGfmn0x_A895vEu9qB-wToYSGBTOX9Ih2EXIkE99swQh5yq_j_sZdG81"
    };

    const urls = Array(empIds.length).fill(secondApiUrl);
    const dataArray = empIds.map(empId => JSON.stringify({ EmpText: empId }));
    
    const results = await callApiParallel(
      urls, 
      secondApiHeaders, 
      dataArray
    );

    // Process Results
    const processedResults = [];
    
    results.forEach((result, index) => {
      const empId = empIds[index];
      if (!teacherData[empId]) return;

      // Format the employee details
      const formattedDetails = {};
      
      // Recursive function to flatten and format the response
      const flattenObject = (obj, prefix = '') => {
        for (const [key, value] of Object.entries(obj)) {
          const newKey = prefix ? `${prefix}_${key}` : key;
          
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            flattenObject(value, newKey);
          } else {
            formattedDetails[newKey] = typeof value === 'string' && value.includes('T') 
              ? formatDate(value) 
              : value;
          }
        }
      };
      
      flattenObject(result);

      processedResults.push({
        basic_info: teacherData[empId],
        details: formattedDetails
      });
    });

    // Return successful response
    res.status(200).json({
      ok: true,
      developer: "Tofazzal Hossain",
      eiin: eiin,
      total_teachers: processedResults.length,
      result: processedResults
    });

  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      ok: false,
      developer: "Tofazzal Hossain",
      error: error.message || "Internal server error"
    });
  }
};
