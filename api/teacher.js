const fetch = require('node-fetch');

// Helper function to extract image URL from HTML
function extractImageUrl(html) {
  if (!html) return null;
  const match = html.match(/src=['"]([^'"]+)['"]/);
  return match ? `https://emis.gov.bd${match[1]}` : null;
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
    // 1st API Call (Teacher Details)
    const firstApiUrl = "https://emis.gov.bd/emis/Portal/GetTeacherDetails";
    const firstApiHeaders = {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-csrf-token": "mrjDRy4u6JHn578J6O88Gk2XbIDuK5Riv-cCsEwX0jlzR0ZjKTP7FIJSw18kxpATi4BVakjqVYU2oKgi1nY82qWq1mv_hFeTgVmtJphZnZ81",
      "x-requested-with": "XMLHttpRequest"
    };

    const firstApiData = `EIIN=${eiin}`;
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
        name: teacher.TeacherName || 'N/A'
      };
    });

    if (empIds.length === 0) {
      return res.status(404).json({
        ok: false,
        developer: "Tofazzal Hossain",
        error: "No valid employee IDs found"
      });
    }

    // 2nd API Call (Employee Info)
    const secondApiUrl = "https://emis.gov.bd/emis/services/HRM/Public/GetEmployeeInfo";
    const secondApiHeaders = {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json",
      "x-csrf-token": "3qD1htkwe6CT6AHZnchO0Puc63a_FFgJ80lqW3BHyWvKeGRV5Hv5jGfmn0x_A895vEu9qB-wToYSGBTOX9Ih2EXIkE99swQh5yq_j_sZdG81",
      "x-requested-with": "XMLHttpRequest"
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

      const formattedData = {};
      
      // Flatten the response data and format dates
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'object' && value !== null) {
          for (const [subKey, subValue] of Object.entries(value)) {
            formattedData[subKey] = typeof subValue === 'string' && subValue.includes('T') 
              ? formatDate(subValue) 
              : subValue;
          }
        } else {
          formattedData[key] = typeof value === 'string' && value.includes('T') 
            ? formatDate(value) 
            : value;
        }
      }

      processedResults.push({
        basic_info: teacherData[empId],
        details: formattedData
      });
    });

    // Return successful response
    res.status(200).json({
      ok: true,
      developer: "Tofazzal Hossain",
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
