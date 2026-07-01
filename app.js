// State variables
let db = null;
let activeProject = 'hr'; // 'hr', 'auto', 'call' or custom dataset ID
let activeTab = 'explorer'; // 'explorer', 'playground', 'guide'
let activeDialect = 'sqlite'; // 'sqlite', 'original'
let activeQueryIndex = 0;
let activeBrowsePage = 1;
const browsePageSize = 100;
let chartInstance = null;
let currentUser = null;
let uploadedDatasets = [];

// Project helper to resolve default vs user-uploaded datasets
function getSavedTasks(projKey) {
    try {
        const allSaved = JSON.parse(localStorage.getItem('sql_arena_saved_tasks') || '{}');
        return allSaved[projKey] || [];
    } catch (_) {
        return [];
    }
}

function saveQueryAsTask(projKey, task) {
    try {
        const allSaved = JSON.parse(localStorage.getItem('sql_arena_saved_tasks') || '{}');
        if (!allSaved[projKey]) {
            allSaved[projKey] = [];
        }
        task.custom = true;
        allSaved[projKey].push(task);
        localStorage.setItem('sql_arena_saved_tasks', JSON.stringify(allSaved));
    } catch (e) {
        console.error('Error saving task:', e);
    }
}

function deleteSavedTask(projKey, taskTitle) {
    try {
        const allSaved = JSON.parse(localStorage.getItem('sql_arena_saved_tasks') || '{}');
        if (allSaved[projKey]) {
            allSaved[projKey] = allSaved[projKey].filter(t => t.title !== taskTitle);
            localStorage.setItem('sql_arena_saved_tasks', JSON.stringify(allSaved));
        }
    } catch (e) {
        console.error('Error deleting task:', e);
    }
}

function getProject(projKey) {
    let proj = null;
    if (projects[projKey]) {
        // Deep copy static template config
        proj = JSON.parse(JSON.stringify(projects[projKey]));
    } else {
        const custom = uploadedDatasets.find(d => d.id === projKey);
        if (custom) {
            proj = {
                category: 'Custom Dataset',
                title: custom.name,
                description: `Querying user-uploaded custom table "${custom.tableName}".`,
                tableName: custom.tableName,
                schema: custom.schema,
                queries: [
                    {
                        title: 'Select All',
                        desc: `Fetch first 50 records from the table "${custom.tableName}".`,
                        sqlite: `SELECT * FROM "${custom.tableName}" LIMIT 50;`,
                        original: `SELECT * FROM "${custom.tableName}" LIMIT 50;`
                    },
                    {
                        title: 'Row Count Summary',
                        desc: 'Count total number of rows in this table.',
                        sqlite: `SELECT COUNT(*) AS total_rows FROM "${custom.tableName}";`,
                        original: `SELECT COUNT(*) AS total_rows FROM "${custom.tableName}";`
                    }
                ]
            };
        }
    }

    if (proj) {
        const customQueries = getSavedTasks(projKey);
        proj.queries = proj.queries.concat(customQueries);
        return proj;
    }
    return null;
}

// User store helpers (localStorage-backed) — defined early so checkSession can use them
function getUserStore() {
    try {
        return JSON.parse(localStorage.getItem('sql_arena_users') || '[]');
    } catch (_) {
        return [];
    }
}

function saveUserStore(users) {
    localStorage.setItem('sql_arena_users', JSON.stringify(users));
}

function loadCustomDatasetsFromStorage() {
    try {
        uploadedDatasets = JSON.parse(localStorage.getItem('sql_arena_custom_datasets') || '[]');
    } catch (_) {
        uploadedDatasets = [];
    }
}

function saveCustomDatasetsToStorage() {
    try {
        localStorage.setItem('sql_arena_custom_datasets', JSON.stringify(uploadedDatasets));
    } catch (_) {}
}

// Project Configs
const projects = {
    hr: {
        category: 'HR Analytics',
        title: 'Analyzing HR Employee Trends',
        description: 'Explore human resource details to discover attrition drivers, satisfaction aggregates, and demographic summaries.',
        tableName: 'hrdata',
        csvPath: './Analyzing Employee Trends/Analyzing Employee Trends.csv',
        schema: [
            { name: 'emp_no', type: 'INTEGER', desc: 'Unique identification number of the employee.' },
            { name: 'gender', type: 'TEXT', desc: 'Gender of the employee (Male/Female).' },
            { name: 'marital_status', type: 'TEXT', desc: 'Marital status (Single, Married, Divorced).' },
            { name: 'age_band', type: 'TEXT', desc: 'Age grouping interval (e.g., 25 - 34).' },
            { name: 'age', type: 'INTEGER', desc: 'Age of the employee.' },
            { name: 'department', type: 'TEXT', desc: 'Business department (Sales, R&D, HR).' },
            { name: 'education', type: 'TEXT', desc: 'Level of education (e.g., Bachelor\'s Degree).' },
            { name: 'education_field', type: 'TEXT', desc: 'Field of academic study.' },
            { name: 'job_role', type: 'TEXT', desc: 'Job role or designation.' },
            { name: 'business_travel', type: 'TEXT', desc: 'Travel frequency (Travel_Rarely, Travel_Frequently, Non-Travel).' },
            { name: 'employee_count', type: 'INTEGER', desc: 'Employee head count (constant 1 for normalization).' },
            { name: 'attrition', type: 'TEXT', desc: 'Has the employee left? (Yes/No).' },
            { name: 'attrition_label', type: 'TEXT', desc: 'Readable label (Current Employee / Ex-Employee).' },
            { name: 'job_satisfaction', type: 'INTEGER', desc: 'Job satisfaction score on a scale of 1 to 4.' },
            { name: 'active_employee', type: 'INTEGER', desc: 'Binary active flag (1 for active, 0 for inactive).' }
        ],
        queries: [
            {
                title: '0. Basic Select',
                desc: 'Retrieve initial records to see table structure.',
                original: 'SELECT * FROM hrdata;',
                sqlite: 'SELECT * FROM hrdata LIMIT 100;'
            },
            {
                title: '1. Count Employees',
                desc: 'Count the total number of employees in each department.',
                original: 'SELECT department, COUNT(*) AS employee_count\nFROM hrdata\nGROUP BY department;',
                sqlite: 'SELECT department, COUNT(*) AS employee_count\nFROM hrdata\nGROUP BY department;'
            },
            {
                title: '2. Average Age',
                desc: 'Calculate the average age for each department.',
                original: 'SELECT department, AVG(age) AS average_age\nFROM hrdata\nGROUP BY department;',
                sqlite: 'SELECT department, ROUND(AVG(age), 2) AS average_age\nFROM hrdata\nGROUP BY department;'
            },
            {
                title: '3. Common Job Roles',
                desc: 'Identify the most common job roles in each department, ordered by count.',
                original: 'SELECT department, job_role, COUNT(*) AS role_count\nFROM hrdata\nGROUP BY department, job_role\nORDER BY department, role_count DESC;',
                sqlite: 'SELECT department, job_role, COUNT(*) AS role_count\nFROM hrdata\nGROUP BY department, job_role\nORDER BY department, role_count DESC;'
            },
            {
                title: '4. Average Satisfaction',
                desc: 'Calculate the average job satisfaction for each education level.',
                original: 'SELECT education, AVG(job_satisfaction) AS average_satisfaction\nFROM hrdata\nGROUP BY education;',
                sqlite: 'SELECT education, ROUND(AVG(job_satisfaction), 2) AS average_satisfaction\nFROM hrdata\nGROUP BY education;'
            },
            {
                title: '5. Age by Satisfaction',
                desc: 'Determine the average age for employees with different levels of job satisfaction.',
                original: 'SELECT job_satisfaction, AVG(age) AS average_age\nFROM hrdata\nGROUP BY job_satisfaction;',
                sqlite: 'SELECT job_satisfaction, ROUND(AVG(age), 2) AS average_age\nFROM hrdata\nGROUP BY job_satisfaction;'
            },
            {
                title: '6. Attrition Rate by Age',
                desc: 'Calculate the percentage attrition rate for each age band.',
                original: 'SELECT age_band, SUM(CASE WHEN attrition = \'Yes\' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS attrition_rate\nFROM hrdata\nGROUP BY age_band;',
                sqlite: 'SELECT age_band, ROUND(SUM(CASE WHEN attrition = \'Yes\' THEN 1.0 ELSE 0.0 END) / COUNT(*) * 100.0, 2) AS attrition_rate\nFROM hrdata\nGROUP BY age_band;'
            },
            {
                title: '7. Peak Satisfaction Department',
                desc: 'Identify the department with the highest average job satisfaction.',
                original: 'SELECT department, AVG(job_satisfaction) AS average_satisfaction\nFROM hrdata\nGROUP BY department\nORDER BY average_satisfaction DESC, department\nLIMIT 1;',
                sqlite: 'SELECT department, ROUND(AVG(job_satisfaction), 2) AS average_satisfaction\nFROM hrdata\nGROUP BY department\nORDER BY average_satisfaction DESC\nLIMIT 1;'
            },
            {
                title: '8. Highest Attrition Band',
                desc: 'Find the age band with the highest attrition rate among employees with a specific education level.',
                original: 'SELECT education, age_band, SUM(CASE WHEN attrition = \'Yes\' THEN 1 ELSE 0 END) / COUNT(*) * 100 AS attrition_rate\nFROM hrdata\nGROUP BY education, age_band\nORDER BY attrition_rate DESC\nLIMIT 1;',
                sqlite: 'SELECT education, age_band, ROUND(SUM(CASE WHEN attrition = \'Yes\' THEN 1.0 ELSE 0.0 END) / COUNT(*) * 100.0, 2) AS attrition_rate\nFROM hrdata\nGROUP BY education, age_band\nORDER BY attrition_rate DESC\nLIMIT 1;'
            },
            {
                title: '9. Travel & Satisfaction',
                desc: 'Find the top 3 education levels with the highest average satisfaction among frequent travelers.',
                original: 'SELECT education, AVG(job_satisfaction) AS average_satisfaction\nFROM hrdata\nWHERE business_travel = \'Travel_Frequently\'\nGROUP BY education\nORDER BY average_satisfaction DESC\nLIMIT 3;',
                sqlite: 'SELECT education, ROUND(AVG(job_satisfaction), 2) AS average_satisfaction\nFROM hrdata\nWHERE business_travel = \'Travel_Frequently\'\nGROUP BY education\nORDER BY average_satisfaction DESC\nLIMIT 3;'
            },
            {
                title: '10. Married Satisfaction',
                desc: 'Identify the age band with the highest average satisfaction among married employees.',
                original: 'SELECT age_band, AVG(job_satisfaction) AS average_satisfaction\nFROM hrdata\nWHERE marital_status = \'Married\'\nGROUP BY age_band\nORDER BY average_satisfaction DESC\nLIMIT 1;',
                sqlite: 'SELECT age_band, ROUND(AVG(job_satisfaction), 2) AS average_satisfaction\nFROM hrdata\nWHERE marital_status = \'Married\'\nGROUP BY age_band\nORDER BY average_satisfaction DESC\nLIMIT 1;'
            }
        ]
    },
    auto: {
        category: 'Automotive Data',
        title: 'Exploring Automotive Industry Trends',
        description: 'Analyze car models sales data to understand pricing patterns, moving averages, and yearly price decreases.',
        tableName: 'car_info',
        csvPath: './Exploring Trends in the Automotive Industry/Exploring Trends in the Automotive Industry.csv',
        schema: [
            { name: 'Name', type: 'TEXT', desc: 'Car model name.' },
            { name: 'year', type: 'INTEGER', desc: 'Year of manufacturing.' },
            { name: 'selling_price', type: 'INTEGER', desc: 'Price at which the car was sold.' },
            { name: 'km_driven', type: 'INTEGER', desc: 'Total kilometers the car has driven.' },
            { name: 'fuel', type: 'TEXT', desc: 'Fuel type (Petrol, Diesel, CNG, LPG, Electric).' },
            { name: 'seller_type', type: 'TEXT', desc: 'Type of seller (Individual/Dealer).' },
            { name: 'transmission', type: 'TEXT', desc: 'Transmission mechanism (Manual/Automatic).' },
            { name: 'owner', type: 'TEXT', desc: 'Ownership number (First Owner, Second Owner, etc.).' },
            { name: 'mileage', type: 'REAL', desc: 'Fuel economy/mileage parsed to numeric float.' },
            { name: 'engine', type: 'INTEGER', desc: 'Engine volume in CC.' },
            { name: 'max_power', type: 'REAL', desc: 'Max power output in bhp.' },
            { name: 'torque', type: 'TEXT', desc: 'Torque specifications.' },
            { name: 'seats', type: 'INTEGER', desc: 'Number of passenger seats.' }
        ],
        queries: [
            {
                title: '0. Basic Select',
                desc: 'Retrieve initial records to see table structure.',
                original: 'SELECT * FROM car_info;',
                sqlite: 'SELECT * FROM car_info LIMIT 100;'
            },
            {
                title: '1. Price by Fuel (Manual)',
                desc: 'Calculate average selling price for first-owner manual cars by fuel type.',
                original: 'SELECT fuel, AVG(selling_price) AS avg_selling_price\nFROM car_info\nWHERE transmission = \'Manual\' AND owner = \'First Owner\'\nGROUP BY fuel;',
                sqlite: 'SELECT fuel, ROUND(AVG(selling_price), 2) AS avg_selling_price\nFROM car_info\nWHERE transmission = \'Manual\' AND owner = \'First Owner\'\nGROUP BY fuel;'
            },
            {
                title: '2. High Mileage Models',
                desc: 'Find the top 3 car models with the highest average mileage, with more than 5 seats.',
                original: 'SELECT Name, AVG(mileage) AS avg_mileage\nFROM car_info\nWHERE seats > 5\nGROUP BY Name\nORDER BY avg_mileage DESC\nLIMIT 3;',
                sqlite: 'SELECT Name, ROUND(AVG(mileage), 2) AS avg_mileage\nFROM car_info\nWHERE seats > 5\nGROUP BY Name\nORDER BY avg_mileage DESC\nLIMIT 3;'
            },
            {
                title: '3. Price Spread Models',
                desc: 'Identify car models where the difference between max and min price is > $10,000.',
                original: 'SELECT Name\nFROM car_info\nGROUP BY Name\nHAVING MAX(selling_price) - MIN(selling_price) > 10000;',
                sqlite: 'SELECT Name, (MAX(selling_price) - MIN(selling_price)) AS price_difference\nFROM car_info\nGROUP BY Name\nHAVING MAX(selling_price) - MIN(selling_price) > 10000\nORDER BY price_difference DESC;'
            },
            {
                title: '4. High Price / Low Mileage',
                desc: 'Retrieve cars with selling price above average and mileage below average.',
                original: 'SELECT Name\nFROM car_info\nWHERE selling_price > (SELECT AVG(selling_price) FROM car_info)\n    AND mileage < (SELECT AVG(mileage) FROM car_info);',
                sqlite: 'SELECT DISTINCT Name FROM car_info\nWHERE selling_price > (SELECT AVG(selling_price) FROM car_info)\n    AND mileage < (SELECT AVG(mileage) FROM car_info)\nLIMIT 100;'
            },
            {
                title: '5. Cumulative Price Sum',
                desc: 'Calculate cumulative sum of selling prices over years for each model.',
                original: 'SELECT Name, year, selling_price, \n       SUM(selling_price) OVER (PARTITION BY Name ORDER BY year) AS cumulative_sum\nFROM car_info;',
                sqlite: 'SELECT Name, year, selling_price, \n       SUM(selling_price) OVER (PARTITION BY Name ORDER BY year) AS cumulative_sum\nFROM car_info\nLIMIT 100;'
            },
            {
                title: '6. Close to Average Price',
                desc: 'Identify car models that have a selling price within 10% of the overall average.',
                original: 'SELECT Name, selling_price\nFROM car_info\nWHERE selling_price BETWEEN (SELECT AVG(selling_price) * 0.9 FROM car_info) AND (SELECT AVG(selling_price) * 1.1 FROM car_info);',
                sqlite: 'SELECT Name, selling_price\nFROM car_info\nWHERE selling_price BETWEEN (SELECT AVG(selling_price) * 0.9 FROM car_info) AND (SELECT AVG(selling_price) * 1.1 FROM car_info)\nLIMIT 100;'
            },
            {
                title: '7. Moving Average Price',
                desc: 'Compute moving average of selling prices for each car model.',
                original: 'SELECT Name, year, selling_price,\n       AVG(selling_price) OVER (PARTITION BY Name ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS ema_selling_price\nFROM car_info;',
                sqlite: 'SELECT Name, year, selling_price,\n       ROUND(AVG(selling_price) OVER (PARTITION BY Name ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2) AS moving_avg_price\nFROM car_info\nLIMIT 100;'
            },
            {
                title: '8. Price Decrease YoY',
                desc: 'Identify the car models that have had a decrease in selling price from the previous year.',
                original: 'SELECT Name, year, selling_price\nFROM (\n    SELECT Name, year, selling_price,\n           LAG(selling_price) OVER (PARTITION BY Name ORDER BY year) AS previous_year_price\n    FROM car_info\n) AS price_changes\nWHERE selling_price < previous_year_price;',
                sqlite: 'SELECT Name, year, selling_price, previous_year_price\nFROM (\n    SELECT Name, year, selling_price,\n           LAG(selling_price) OVER (PARTITION BY Name ORDER BY year) AS previous_year_price\n    FROM car_info\n) AS price_changes\nWHERE previous_year_price IS NOT NULL AND selling_price < previous_year_price\nLIMIT 100;'
            },
            {
                title: '9. Highest Mileage / Transmission',
                desc: 'Retrieve cars with the highest total mileage for each transmission type.',
                original: 'WITH TotalMileage AS (\n    SELECT Name, transmission, SUM(km_driven) AS total_mileage\n    FROM car_info\n    GROUP BY Name, transmission\n)\nSELECT Name, transmission, total_mileage\nFROM TotalMileage\nWHERE (transmission, total_mileage) IN (\n    SELECT transmission, MAX(total_mileage)\n    FROM TotalMileage\n    GROUP BY transmission\n);',
                sqlite: 'WITH TotalMileage AS (\n    SELECT Name, transmission, SUM(km_driven) AS total_mileage\n    FROM car_info\n    GROUP BY Name, transmission\n),\nMaxMileage AS (\n    SELECT transmission, MAX(total_mileage) AS max_mileage\n    FROM TotalMileage\n    GROUP BY transmission\n)\nSELECT tm.Name, tm.transmission, tm.total_mileage\nFROM TotalMileage tm\nJOIN MaxMileage mm ON tm.transmission = mm.transmission AND tm.total_mileage = mm.max_mileage;'
            },
            {
                title: '10. Price per Year (Top Models)',
                desc: 'Find the average selling price per year for models with high-value ranks.',
                original: 'WITH RankedSellingPrices AS (\n    SELECT Name, selling_price,\n           RANK() OVER (PARTITION BY Name ORDER BY selling_price DESC) AS price_rank\n    FROM car_info\n)\nSELECT Name, year, AVG(selling_price) AS avg_selling_price_per_year\nFROM car_info\nWHERE Name IN (\n    SELECT Name\n    FROM RankedSellingPrices\n    WHERE price_rank <= 3\n)\nGROUP BY Name, year;',
                sqlite: '/* Corrected: Average price per year for the top 3 overall most expensive car models */\nWITH TopModels AS (\n    SELECT Name, MAX(selling_price) AS max_price\n    FROM car_info\n    GROUP BY Name\n    ORDER BY max_price DESC\n    LIMIT 3\n)\nSELECT Name, year, ROUND(AVG(selling_price), 2) AS avg_selling_price_per_year\nFROM car_info\nWHERE Name IN (SELECT Name FROM TopModels)\nGROUP BY Name, year\nORDER BY Name, year;'
            }
        ]
    },
    call: {
        category: 'Customer Operations',
        title: 'Call Center Performance Analytics',
        description: 'Clean raw data (formatting timestamp dates and mapping blanks to NULL) and analyze CSAT scores, response times, and daily volumes.',
        tableName: 'call_center',
        csvPath: './call center data cleaning/Call Center.csv',
        schema: [
            { name: 'id', type: 'TEXT', desc: 'Unique call record ID.' },
            { name: 'customer_name', type: 'TEXT', desc: 'Name of the customer.' },
            { name: 'sentiment', type: 'TEXT', desc: 'Customer call sentiment (e.g. Very Positive, Neutral, Negative).' },
            { name: 'csat_score', type: 'INTEGER', desc: 'Customer satisfaction score (1-10).' },
            { name: 'call_timestamp', type: 'TEXT', desc: 'Date of the call (formatted to YYYY-MM-DD).' },
            { name: 'reason', type: 'TEXT', desc: 'Customer reason for calling (e.g. Payments, Billing).' },
            { name: 'city', type: 'TEXT', desc: 'Customer location city.' },
            { name: 'state', type: 'TEXT', desc: 'Customer location state.' },
            { name: 'channel', type: 'TEXT', desc: 'Contact channel (Call-Center, Web, Email, Chatbot).' },
            { name: 'response_time', type: 'TEXT', desc: 'Response rating (Within SLA, Below SLA, Above SLA).' },
            { name: 'call duration in minutes', type: 'INTEGER', desc: 'Length of the call in minutes.' },
            { name: 'call_center', type: 'TEXT', desc: 'Call center location servicing the call.' }
        ],
        queries: [
            {
                title: '0. Basic Select',
                desc: 'Retrieve initial records to see table structure.',
                original: 'SELECT * FROM call_center;',
                sqlite: 'SELECT * FROM call_center LIMIT 100;'
            },
            {
                title: '1. Data Cleaning Script',
                desc: 'Clean raw string dates and update empty satisfaction scores to NULL.',
                original: 'SET SQL_SAFE_UPDATES = 0;\nUPDATE call_center \nSET call_timestamp = str_to_date(call_timestamp, "%m/%d/%Y");\nUPDATE call_center \nSET csat_score = NULL\nWHERE csat_score = \'\';\nSET SQL_SAFE_UPDATES = 1;',
                sqlite: '-- Note: SQLite dates and empty values are cleaned automatically during CSV loading'
            },
            {
                title: '2. Table Metrics',
                desc: 'Count total rows and columns of the call center table.',
                original: 'SELECT COUNT(*) AS num_rows FROM call_center;\nSELECT COUNT(*) AS num_columns\nFROM information_schema.columns\nWHERE table_name = \'call_center\' AND table_schema = \'call_centerdata\';',
                sqlite: 'SELECT COUNT(*) AS num_rows FROM call_center;\n-- SQLite specific column count query:\nSELECT COUNT(*) AS num_columns FROM pragma_table_info(\'call_center\');'
            },
            {
                title: '3. Column Values (Sentiment)',
                desc: 'Review distinct sentiments, cities, and call center locations.',
                original: 'SELECT DISTINCT sentiment FROM call_center;\nSELECT DISTINCT city FROM call_center;\nSELECT DISTINCT call_center FROM call_center;',
                sqlite: 'SELECT DISTINCT sentiment FROM call_center;'
            },
            {
                title: '4. City Distribution',
                desc: 'Calculate the total count and percent share of calls for each city.',
                original: 'SELECT city,\n  COUNT(*) AS count,\n  COUNT(*) * 100.0 / (SELECT COUNT(*) FROM call_center) AS percentage\nFROM call_center\nGROUP BY city\nORDER BY count DESC;',
                sqlite: 'SELECT city,\n  COUNT(*) AS count,\n  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM call_center), 2) AS percentage\nFROM call_center\nGROUP BY city\nORDER BY count DESC\nLIMIT 20;'
            },
            {
                title: '5. Volume by Day of Week',
                desc: 'Calculate call volumes for each day of the week, ordered by peak count.',
                original: 'SELECT DAYNAME(call_timestamp) AS day_of_week,\nCOUNT(*) AS call_count\nFROM call_center\nGROUP BY day_of_week\nORDER BY call_count DESC;',
                sqlite: 'SELECT \n  CASE strftime(\'%w\', call_timestamp)\n    WHEN \'0\' THEN \'Sunday\'\n    WHEN \'1\' THEN \'Monday\'\n    WHEN \'2\' THEN \'Tuesday\'\n    WHEN \'3\' THEN \'Wednesday\'\n    WHEN \'4\' THEN \'Thursday\'\n    WHEN \'5\' THEN \'Friday\'\n    WHEN \'6\' THEN \'Saturday\'\n  END AS day_of_week,\n  COUNT(*) AS call_count\nFROM call_center\nGROUP BY day_of_week\nORDER BY call_count DESC;'
            },
            {
                title: '6. Call Duration Summary',
                desc: 'Determine the minimum, maximum, and average call duration in minutes.',
                original: 'SELECT\n  MIN(`call duration in minutes`) AS min_duration,\n  MAX(`call duration in minutes`) AS max_duration,\n  AVG(`call duration in minutes`) AS avg_duration\nFROM call_center;',
                sqlite: 'SELECT\n  MIN("call duration in minutes") AS min_duration,\n  MAX("call duration in minutes") AS max_duration,\n  ROUND(AVG("call duration in minutes"), 2) AS avg_duration\nFROM call_center;'
            },
            {
                title: '7. Customer Satisfaction (CSAT)',
                desc: 'Calculate satisfaction score aggregations, excluding missing scores (0).',
                original: 'SELECT\n  MIN(csat_score) AS min_csat,\n  MAX(csat_score) AS max_csat,\n  ROUND(AVG(csat_score), 2) AS avg_csat\nFROM call_center\nWHERE csat_score <> 0;',
                sqlite: 'SELECT\n  MIN(csat_score) AS min_csat,\n  MAX(csat_score) AS max_csat,\n  ROUND(AVG(csat_score), 2) AS avg_csat\nFROM call_center\nWHERE csat_score IS NOT NULL AND csat_score <> 0;'
            },
            {
                title: '8. Response SLA Performance',
                desc: 'Count SLA response time occurrences for each call center location.',
                original: 'SELECT call_center, response_time, COUNT(*) as count\nFrom call_centerdata.call_center GROUP BY 1,2 ORDER BY 1,3 DESC;',
                sqlite: 'SELECT call_center, response_time, COUNT(*) AS count\nFROM call_center\nGROUP BY call_center, response_time\nORDER BY call_center, count DESC;'
            },
            {
                title: '9. Daily Max Call Duration',
                desc: 'Identify maximum call duration logged for each calendar day.',
                original: 'SELECT\n  DATE(call_timestamp) AS call_day,\n  MAX(`call duration in minutes`) AS max_call_duration\nFROM call_center\nGROUP BY call_day\nORDER BY call_day;',
                sqlite: 'SELECT\n  DATE(call_timestamp) AS call_day,\n  MAX("call duration in minutes") AS max_call_duration\nFROM call_center\nGROUP BY call_day\nORDER BY call_day\nLIMIT 50;'
            }
        ]
    }
};

// UI Elements
const els = {
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingMsg: document.getElementById('loading-msg'),
    projectCategory: document.getElementById('project-category'),
    projectTitle: document.getElementById('project-title'),
    projectDescription: document.getElementById('project-description'),
    activeTableName: document.getElementById('active-table-name'),
    activeTableRows: document.getElementById('active-table-rows'),
    schemaBadge: document.getElementById('schema-badge'),
    schemaTbody: document.getElementById('schema-tbody'),
    browserTable: document.getElementById('browser-table'),
    browsePageIndicator: document.getElementById('browse-page-indicator'),
    btnBrowsePrev: document.getElementById('btn-browse-prev'),
    btnBrowseNext: document.getElementById('btn-browse-next'),
    preloadedQueriesList: document.getElementById('preloaded-queries-list'),
    activeTaskDesc: document.getElementById('active-task-desc'),
    sqlEditor: document.getElementById('sql-editor'),
    editorLineNumbers: document.getElementById('editor-line-numbers'),
    dialectSqlite: document.getElementById('dialect-sqlite'),
    dialectOriginal: document.getElementById('dialect-original'),
    dialectWarning: document.getElementById('dialect-warning'),
    resultsTableContainer: document.getElementById('results-table-container'),
    resultStatus: document.getElementById('result-status'),
    chartControls: document.getElementById('chart-controls'),
    chartTypeSelect: document.getElementById('chart-type-select'),
    chartXSelect: document.getElementById('chart-x-select'),
    chartYSelect: document.getElementById('chart-y-select'),
    chartSplitSelect: document.getElementById('chart-split-select'),
    chartCanvas: document.getElementById('playground-chart'),
    chartEmptyState: document.getElementById('chart-empty-state')
};

// Initialize Application
async function init() {
    checkSession();
}

// Session check
function checkSession() {
    const session = localStorage.getItem('sql_arena_session');
    if (session) {
        try {
            const parsed = JSON.parse(session);
            // Validate the session still matches a registered user
            const users = getUserStore();
            const validUser = users.find(u => u.email === parsed.email);
            if (validUser) {
                currentUser = parsed;
                showDashboard();
            } else {
                // Stale or old-format session — clear and show login
                localStorage.removeItem('sql_arena_session');
                showLoginForm();
            }
        } catch (e) {
            localStorage.removeItem('sql_arena_session');
            showLoginForm();
        }
    } else {
        showLoginForm();
    }
}

function showLoginForm() {
    document.getElementById('login-wrapper').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    els.loadingOverlay.classList.add('hidden');
    lucide.createIcons();
}

async function showDashboard() {
    document.getElementById('login-wrapper').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    els.loadingOverlay.classList.remove('hidden');
    
    // Update User Profile UI details
    const nameDisplay = document.getElementById('user-name-display');
    const roleDisplay = document.getElementById('user-role-display');
    const initialsDisplay = document.getElementById('user-avatar-initials');
    
    if (currentUser) {
        nameDisplay.textContent = currentUser.name;
        roleDisplay.textContent = currentUser.role === 'analyst' ? 'Write Access' : 'Read-Only (Executive)';
        initialsDisplay.textContent = currentUser.name.split(' ').map(n => n[0]).join('');
    }
    
    applyRoleAccess();
    
    // Continue SQLite Initialization
    updateLoadingMsg('Loading SQLite WebAssembly compiler...');
    try {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        db = new SQL.Database();
        
        // Load HR Data
        updateLoadingMsg('Fetching and parsing Employee Trends data...');
        const hrData = await loadCSV(projects.hr.csvPath);
        createAndPopulateTable(projects.hr.tableName, projects.hr.schema, hrData);

        // Load Auto Data
        updateLoadingMsg('Fetching and parsing Automotive sales data...');
        const autoData = await loadCSV(projects.auto.csvPath);
        const cleanedAutoData = cleanAutoDataset(autoData);
        createAndPopulateTable(projects.auto.tableName, projects.auto.schema, cleanedAutoData);

        // Load Call Data
        updateLoadingMsg('Fetching and parsing Call Center logs (this might take a few seconds)...');
        const callData = await loadCSV(projects.call.csvPath);
        const cleanedCallData = cleanCallDataset(callData);
        createAndPopulateTable(projects.call.tableName, projects.call.schema, cleanedCallData);

        // Restore custom datasets from localStorage and populate SQLite tables
        updateLoadingMsg('Restoring custom datasets...');
        loadCustomDatasetsFromStorage();
        uploadedDatasets.forEach(d => {
            try {
                createAndPopulateTable(d.tableName, d.schema, d.rows);
            } catch (err) {
                console.error(`Failed to restore table "${d.tableName}":`, err);
            }
        });
        renderCustomDatasetList();

        hideLoading();
        switchProject('hr');
        
        // Sync Editor line numbers
        els.sqlEditor.addEventListener('input', updateLineNumbers);
        els.sqlEditor.addEventListener('scroll', () => {
            els.editorLineNumbers.scrollTop = els.sqlEditor.scrollTop;
        });

        // Setup lucide icons
        lucide.createIcons();
        
        // Setup Drag & Drop listener for custom datasets
        setupDragAndDrop();
    } catch (err) {
        console.error(err);
        updateLoadingMsg(`Failed to initialize: ${err.message}. Please verify the files are loaded through a local server (Vite).`);
    }
}

// Helper to update loading status
function updateLoadingMsg(msg) {
    els.loadingMsg.textContent = msg;
}

function hideLoading() {
    els.loadingOverlay.classList.add('hidden');
}

function showLoading(msg) {
    updateLoadingMsg(msg);
    els.loadingOverlay.classList.remove('hidden');
}

// Fetch and parse CSV from path
function loadCSV(path) {
    return new Promise((resolve, reject) => {
        Papa.parse(path, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (err) => reject(err)
        });
    });
}

// Clean fields in Automotive Sales dataset
function cleanAutoDataset(data) {
    return data.map(row => {
        const cleanRow = { ...row };
        // Extract numbers from strings like "19.03 kmpl", "999 CC", "71.01bhp"
        if (row.mileage) {
            const mileageNum = parseFloat(row.mileage.replace(/[a-zA-Z\s]/g, ''));
            cleanRow.mileage = isNaN(mileageNum) ? null : mileageNum;
        } else {
            cleanRow.mileage = null;
        }

        if (row.engine) {
            const engineNum = parseInt(row.engine.replace(/[a-zA-Z\s]/g, ''), 10);
            cleanRow.engine = isNaN(engineNum) ? null : engineNum;
        } else {
            cleanRow.engine = null;
        }

        if (row.max_power) {
            const powerNum = parseFloat(row.max_power.replace(/[a-zA-Z\s]/g, ''));
            cleanRow.max_power = isNaN(powerNum) ? null : powerNum;
        } else {
            cleanRow.max_power = null;
        }

        if (row.seats) {
            const seatsNum = parseInt(row.seats, 10);
            cleanRow.seats = isNaN(seatsNum) ? null : seatsNum;
        } else {
            cleanRow.seats = null;
        }

        if (row.selling_price) {
            const price = parseInt(row.selling_price, 10);
            cleanRow.selling_price = isNaN(price) ? null : price;
        } else {
            cleanRow.selling_price = null;
        }

        if (row.year) {
            const y = parseInt(row.year, 10);
            cleanRow.year = isNaN(y) ? null : y;
        } else {
            cleanRow.year = null;
        }

        if (row.km_driven) {
            const km = parseInt(row.km_driven, 10);
            cleanRow.km_driven = isNaN(km) ? null : km;
        } else {
            cleanRow.km_driven = null;
        }

        return cleanRow;
    });
}

// Clean Call Center dates and empty CSAT
function cleanCallDataset(data) {
    return data.map(row => {
        const cleanRow = { ...row };
        
        // Parse date "10/29/2020" to standard YYYY-MM-DD
        if (row.call_timestamp && row.call_timestamp.includes('/')) {
            const parts = row.call_timestamp.split('/');
            if (parts.length === 3) {
                // MM/DD/YYYY to YYYY-MM-DD
                const month = parts[0].padStart(2, '0');
                const day = parts[1].padStart(2, '0');
                const year = parts[2];
                cleanRow.call_timestamp = `${year}-${month}-${day}`;
            }
        }
        
        // Map blank csat_score to null
        if (row.csat_score === '' || row.csat_score === undefined || row.csat_score === null) {
            cleanRow.csat_score = null;
        } else {
            const csat = parseInt(row.csat_score, 10);
            cleanRow.csat_score = isNaN(csat) ? null : csat;
        }

        // Clean duration
        if (row['call duration in minutes']) {
            const duration = parseInt(row['call duration in minutes'], 10);
            cleanRow['call duration in minutes'] = isNaN(duration) ? 0 : duration;
        } else {
            cleanRow['call duration in minutes'] = 0;
        }

        return cleanRow;
    });
}

// SQLite setup and table injection
function createAndPopulateTable(tableName, schema, rows) {
    // Create Table Statement
    const columnsDef = schema.map(c => `"${c.name}" ${c.type}`).join(', ');
    const createQuery = `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnsDef});`;
    db.run(createQuery);
    
    if (rows.length === 0) return;

    // Prepare insert query
    const colNames = schema.map(c => `"${c.name}"`).join(', ');
    const placeholders = schema.map(() => '?').join(', ');
    const insertQuery = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders});`;
    
    // Batch inserts for speed
    db.run("BEGIN TRANSACTION;");
    const stmt = db.prepare(insertQuery);
    for (const row of rows) {
        const values = schema.map(c => {
            const val = row[c.name];
            return val === undefined ? null : val;
        });
        stmt.run(values);
    }
    stmt.free();
    db.run("COMMIT;");
}

// Switch Active Project
function switchProject(projKey) {
    activeProject = projKey;
    activeQueryIndex = 0;
    activeBrowsePage = 1;
    
    // Update active nav buttons
    ['hr', 'auto', 'call'].forEach(k => {
        const btn = document.getElementById(`btn-project-${k}`);
        if (btn) {
            if (k === projKey) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
    
    // Update custom datasets active class in list
    updateCustomDatasetListUI();
    
    // Update labels
    const proj = getProject(projKey);
    if (!proj) return;
    
    els.projectCategory.textContent = proj.category;
    els.projectTitle.textContent = proj.title;
    els.projectDescription.textContent = proj.description;
    els.activeTableName.textContent = proj.tableName;
    els.schemaBadge.textContent = proj.tableName;
    
    // Fetch row counts
    try {
        const result = db.exec(`SELECT COUNT(*) FROM "${proj.tableName}"`);
        const count = result[0].values[0][0];
        els.activeTableRows.textContent = count.toLocaleString();
    } catch (err) {
        els.activeTableRows.textContent = "Error";
    }

    // Render Schema
    renderSchema(proj.schema);
    
    // Render Browse Table
    renderBrowseData();
    
    // Render Preloaded Queries
    renderPreloadedQueries(proj.queries);
    
    // Load first query into editor
    loadPreloadedQuery(0);
    
    // Force active tab to explorer/playground
    switchTab(activeTab === 'guide' ? 'explorer' : activeTab);
}

// Render Schema view
function renderSchema(schema) {
    els.schemaTbody.innerHTML = '';
    schema.forEach(col => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${col.name}</code></td>
            <td><span class="badge">${col.type}</span></td>
            <td style="white-space: normal; color: var(--text-secondary);">${col.desc}</td>
        `;
        els.schemaTbody.appendChild(tr);
    });
}

// Render Data Browser table
function renderBrowseData() {
    const proj = getProject(activeProject);
    if (!proj) return;
    const offset = (activeBrowsePage - 1) * browsePageSize;
    
    try {
        const countRes = db.exec(`SELECT COUNT(*) FROM "${proj.tableName}"`);
        const totalRows = countRes[0].values[0][0];
        const totalPages = Math.ceil(totalRows / browsePageSize);
        
        // Paginate indicators
        els.browsePageIndicator.textContent = `Page ${activeBrowsePage} of ${totalPages || 1}`;
        els.btnBrowsePrev.disabled = activeBrowsePage <= 1;
        els.btnBrowseNext.disabled = activeBrowsePage >= totalPages;
        
        // Fetch rows
        const dataRes = db.exec(`SELECT * FROM "${proj.tableName}" LIMIT ${browsePageSize} OFFSET ${offset}`);
        
        if (dataRes.length === 0) {
            els.browserTable.innerHTML = '<tr><td style="text-align: center;">No data found.</td></tr>';
            return;
        }

        const cols = dataRes[0].columns;
        const vals = dataRes[0].values;
        
        // Generate table header
        let html = '<thead><tr>';
        cols.forEach(c => {
            html += `<th>${c}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        // Generate table body
        vals.forEach(row => {
            html += 'tr>';
            row.forEach(val => {
                const displayVal = val === null ? '<span style="color: var(--text-muted); font-style: italic;">NULL</span>' : val;
                html += `<td>${displayVal}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';
        els.browserTable.innerHTML = html;
    } catch (err) {
        els.browserTable.innerHTML = `<tr><td style="color: var(--red);">Error loading data: ${err.message}</td></tr>`;
    }
}

// Browse Data Pagination controls
function browsePrevPage() {
    if (activeBrowsePage > 1) {
        activeBrowsePage--;
        renderBrowseData();
    }
}

function browseNextPage() {
    activeBrowsePage++;
    renderBrowseData();
}

// Render Preloaded Queries List in SQL Playground
function renderPreloadedQueries(queries) {
    els.preloadedQueriesList.innerHTML = '';
    queries.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = `query-item ${idx === activeQueryIndex ? 'active' : ''}`;
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.id = `q-item-${idx}`;
        
        const clickArea = document.createElement('div');
        clickArea.style.flexGrow = '1';
        clickArea.style.cursor = 'pointer';
        clickArea.onclick = () => loadPreloadedQuery(idx);
        clickArea.innerHTML = `
            <h5 style="margin: 0; font-size: 0.8rem; font-weight: ${idx === activeQueryIndex ? '600' : '500'}; color: var(--text-primary);">${q.title}</h5>
            <p style="margin: 2px 0 0 0; font-size: 0.7rem; color: var(--text-secondary); line-height: 1.3;">${q.desc}</p>
        `;
        item.appendChild(clickArea);

        // Delete button for custom-saved queries
        if (q.custom) {
            const delBtn = document.createElement('button');
            delBtn.className = 'custom-query-delete-btn';
            delBtn.style.background = 'transparent';
            delBtn.style.border = 'none';
            delBtn.style.color = 'var(--text-muted)';
            delBtn.style.cursor = 'pointer';
            delBtn.style.padding = '4px';
            delBtn.style.marginLeft = '8px';
            delBtn.style.display = 'flex';
            delBtn.style.alignItems = 'center';
            delBtn.style.justifyContent = 'center';
            delBtn.title = "Delete task";
            delBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Delete the custom task "${q.title}"?`)) {
                    deleteSavedTask(activeProject, q.title);
                    const proj = getProject(activeProject);
                    renderPreloadedQueries(proj.queries);
                    loadPreloadedQuery(0);
                }
            };
            item.appendChild(delBtn);
        }

        els.preloadedQueriesList.appendChild(item);
    });
    lucide.createIcons();
}

// Load preloaded query into the editor
function loadPreloadedQuery(idx) {
    activeQueryIndex = idx;
    
    // Toggle active class in queries list
    const items = els.preloadedQueriesList.getElementsByClassName('query-item');
    for (let i = 0; i < items.length; i++) {
        if (i === idx) {
            items[i].classList.add('active');
        } else {
            items[i].classList.remove('active');
        }
    }
    
    const queryObj = getProject(activeProject).queries[idx];
    els.activeTaskDesc.textContent = queryObj.desc;
    
    // Load based on active Dialect
    const isExecutive = currentUser && currentUser.role === 'executive';
    if (activeDialect === 'sqlite') {
        els.sqlEditor.value = queryObj.sqlite;
        els.sqlEditor.readOnly = isExecutive;
        els.dialectWarning.classList.add('hidden');
    } else {
        els.sqlEditor.value = queryObj.original;
        els.sqlEditor.readOnly = true;
        els.dialectWarning.classList.remove('hidden');
    }
    
    updateLineNumbers();
    
    // Auto execute preloaded queries for Executive
    if (isExecutive && activeDialect === 'sqlite') {
        setTimeout(executeCurrentQuery, 100);
    }
}

// Set Dialect between SQLite (Run) and Original (View)
function setDialect(dialect) {
    activeDialect = dialect;
    if (dialect === 'sqlite') {
        els.dialectSqlite.classList.add('active');
        els.dialectOriginal.classList.remove('active');
    } else {
        els.dialectSqlite.classList.remove('active');
        els.dialectOriginal.classList.add('active');
    }
    
    // Reload query with new dialect
    loadPreloadedQuery(activeQueryIndex);
}

// Update Line Numbers in textarea gutter
function updateLineNumbers() {
    const lines = els.sqlEditor.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
        html += `${i}<br>`;
    }
    els.editorLineNumbers.innerHTML = html;
}

// Run current SQL Query
function executeCurrentQuery() {
    const query = els.sqlEditor.value.trim();
    if (!query) {
        alert('Please write a SQL query first.');
        return;
    }
    
    // If original dialect is active, warn user
    if (activeDialect === 'original') {
        alert('Please switch the Dialect selector to "SQLite" to run or edit queries.');
        return;
    }
    
    const startTime = performance.now();
    try {
        const results = db.exec(query);
        const duration = (performance.now() - startTime).toFixed(1);
        
        if (results.length === 0) {
            renderEmptyResults(`Query executed successfully in ${duration}ms. (No rows returned)`);
            return;
        }
        
        const cols = results[0].columns;
        const vals = results[0].values;
        
        // Show success status
        els.resultStatus.innerHTML = `<span style="color: var(--green); font-weight: 600;"><i data-lucide="check-circle" style="display:inline-block; width:12px; height:12px; vertical-align:-1px;"></i> Success</span> (${vals.length} rows, ${duration}ms)`;
        
        // Render Output Table
        renderQueryResultsTable(cols, vals);
        
        // Setup options for visual chart mappings
        setupChartAxes(cols, vals);
        
        // Sync icon tags
        lucide.createIcons();
    } catch (err) {
        const duration = (performance.now() - startTime).toFixed(1);
        els.resultStatus.innerHTML = `<span style="color: var(--red); font-weight: 600;"><i data-lucide="alert-circle" style="display:inline-block; width:12px; height:12px; vertical-align:-1px;"></i> Error</span> (${duration}ms)`;
        renderErrorResults(err.message);
        lucide.createIcons();
    }
}

// Render result table
function renderQueryResultsTable(cols, vals) {
    let html = '<table class="data-table"><thead><tr>';
    cols.forEach(c => {
        html += `<th>${c}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    // Limit displaying to 500 rows to prevent browser lagging
    const displayRows = vals.slice(0, 500);
    
    displayRows.forEach(row => {
        html += '<tr>';
        row.forEach(val => {
            const displayVal = val === null ? '<span style="color: var(--text-muted); font-style: italic;">NULL</span>' : val;
            html += `<td>${displayVal}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    
    if (vals.length > 500) {
        html += `<div style="padding: 12px; text-align: center; font-size: 0.8rem; color: var(--text-muted); border-top: 1px solid var(--border);">Showing first 500 rows of ${vals.length} total.</div>`;
    }
    
    els.resultsTableContainer.innerHTML = html;
}

function renderEmptyResults(msg) {
    els.resultsTableContainer.innerHTML = `
        <div class="empty-state">
            <i data-lucide="check" style="color: var(--green);"></i>
            <p>${msg}</p>
        </div>
    `;
    els.resultStatus.textContent = msg;
    els.chartControls.classList.add('hidden');
    els.chartCanvas.style.display = 'none';
    els.chartEmptyState.style.display = 'flex';
    els.chartEmptyState.querySelector('p').textContent = 'Plot empty (no values returned from query)';
}

function renderErrorResults(errMsg) {
    els.resultsTableContainer.innerHTML = `
        <div class="empty-state" style="color: var(--red);">
            <i data-lucide="x-circle"></i>
            <p style="font-weight: 600;">SQL Error</p>
            <pre style="text-align: left; background: hsl(223, 47%, 4%); padding: 12px; border-radius: 6px; border: 1px solid var(--border); font-family: var(--font-mono); font-size: 0.75rem; max-width: 100%; white-space: pre-wrap; word-break: break-all;"><code>${errMsg}</code></pre>
        </div>
    `;
    els.chartControls.classList.add('hidden');
    els.chartCanvas.style.display = 'none';
    els.chartEmptyState.style.display = 'flex';
    els.chartEmptyState.querySelector('p').textContent = 'Visualizations unavailable due to query execution error.';
}

// Setup Chart controls based on returned rows
let lastCols = [];
let lastVals = [];

function setupChartAxes(cols, vals) {
    lastCols = cols;
    lastVals = vals;
    
    // Clear dropdowns
    els.chartXSelect.innerHTML = '';
    els.chartYSelect.innerHTML = '';
    els.chartSplitSelect.innerHTML = '';
    
    // Identify numeric vs text column indexes
    let numericCols = [];
    let textCols = [];
    
    if (vals.length > 0) {
        const firstRow = vals[0];
        cols.forEach((col, idx) => {
            const val = firstRow[idx];
            if (typeof val === 'number') {
                numericCols.push(col);
            } else {
                textCols.push(col);
            }
        });
    }
    
    if (numericCols.length === 0) {
        numericCols = [...cols];
    }
    
    // 1. Populate X-Axis Select (All columns are eligible as dimension/labels)
    if (textCols.length > 1) {
        const opt = document.createElement('option');
        opt.value = '__combined__';
        opt.textContent = 'Combined Categories (All text)';
        els.chartXSelect.appendChild(opt);
    }
    
    cols.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        els.chartXSelect.appendChild(opt);
    });
    
    // 2. Populate Y-Axis Select (Only numeric columns for values)
    numericCols.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        els.chartYSelect.appendChild(opt);
    });
    
    // 3. Populate Split By Select (Legend) - Text columns
    const noneOpt = document.createElement('option');
    noneOpt.value = 'none';
    noneOpt.textContent = 'None (Single Series)';
    els.chartSplitSelect.appendChild(noneOpt);
    
    textCols.forEach(col => {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        els.chartSplitSelect.appendChild(opt);
    });
    
    // Set default selections
    if (textCols.length > 1) {
        els.chartXSelect.value = '__combined__';
    } else if (textCols.length > 0) {
        els.chartXSelect.value = textCols[0];
    } else {
        els.chartXSelect.selectedIndex = 0;
    }
    
    els.chartYSelect.selectedIndex = 0;
    els.chartSplitSelect.value = 'none';
    
    // Show chart controls
    els.chartControls.classList.remove('hidden');
    els.chartCanvas.style.display = 'block';
    els.chartEmptyState.style.display = 'none';
    
    // Plot Chart
    updateChart();
}

function updateChart() {
    if (lastVals.length === 0) return;
    
    const xCol = els.chartXSelect.value;
    const yCol = els.chartYSelect.value;
    const splitCol = els.chartSplitSelect.value;
    const chartType = els.chartTypeSelect.value;
    
    const xIdx = lastCols.indexOf(xCol);
    const yIdx = lastCols.indexOf(yCol);
    const splitIdx = lastCols.indexOf(splitCol);
    
    // Limit to 100 rows in visualization to keep it readable and performant
    const subset = lastVals.slice(0, 100);
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    // Royal based color themes for visualization
    const colors = [
        'rgba(30, 64, 175, 0.75)',   // Royal Blue
        'rgba(4, 120, 87, 0.75)',    // Emerald Green
        'rgba(180, 83, 9, 0.75)',    // Royal Gold
        'rgba(185, 28, 28, 0.75)',   // Crimson Red
        'rgba(71, 85, 105, 0.75)',   // Slate
        'rgba(13, 148, 136, 0.75)'   // Teal
    ];
    
    const borderColors = [
        'rgba(30, 64, 175, 1)',
        'rgba(4, 120, 87, 1)',
        'rgba(180, 83, 9, 1)',
        'rgba(185, 28, 28, 1)',
        'rgba(71, 85, 105, 1)',
        'rgba(13, 148, 136, 1)'
    ];
    
    const ctx = els.chartCanvas.getContext('2d');
    const isPie = chartType === 'pie' || chartType === 'doughnut';
    
    // Read dynamic CSS variables for theme matching
    const borderVar = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#e7e5e4';
    const textSecVar = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#57534e';
    
    let chartConfig = {
        type: chartType,
        data: {},
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: isPie || (splitIdx !== -1 && splitCol !== 'none'),
                    labels: {
                        color: textSecVar,
                        font: { family: 'Inter', size: 10 }
                    }
                }
            },
            scales: isPie ? {} : {
                x: {
                    grid: { color: borderVar },
                    ticks: {
                        color: textSecVar,
                        font: { family: 'Inter', size: 10 }
                    }
                },
                y: {
                    grid: { color: borderVar },
                    ticks: {
                        color: textSecVar,
                        font: { family: 'Inter', size: 10 }
                    }
                }
            }
        }
    };

    // Helper: get X label for a row
    const getXLabel = (row) => {
        if (xCol === '__combined__') {
            // Find all text column indexes
            const textColIndexes = lastCols.map((c, i) => ({name: c, idx: i}))
                                           .filter(item => {
                                               const val = lastVals[0][item.idx];
                                               return typeof val !== 'number';
                                           })
                                           .map(item => item.idx);
            return textColIndexes.map(idx => row[idx] === null ? 'NULL' : String(row[idx])).join(' - ');
        }
        return row[xIdx] === null ? 'NULL' : String(row[xIdx]);
    };
    
    if (splitIdx !== -1 && splitCol !== 'none' && splitCol !== xCol) {
        // Multi-series grouping (Split By / Legend)
        const groups = {};
        const allXValues = new Set();
        
        subset.forEach(row => {
            const groupVal = row[splitIdx] === null ? 'NULL' : String(row[splitIdx]);
            const xVal = getXLabel(row);
            const yVal = parseFloat(row[yIdx]) || 0;
            
            if (!groups[groupVal]) groups[groupVal] = {};
            groups[groupVal][xVal] = yVal;
            allXValues.add(xVal);
        });
        
        // Sort X values to keep axes neat
        const sortedX = Array.from(allXValues).sort((a, b) => {
            if (!isNaN(a) && !isNaN(b)) return parseFloat(a) - parseFloat(b);
            return a.localeCompare(b);
        });
        
        const datasets = Object.keys(groups).map((groupName, idx) => {
            const color = colors[idx % colors.length];
            const border = borderColors[idx % borderColors.length];
            const dataPoints = sortedX.map(x => groups[groupName][x] !== undefined ? groups[groupName][x] : 0);
            
            return {
                label: groupName,
                data: dataPoints,
                backgroundColor: isPie ? colors : color,
                borderColor: isPie ? borderColors : border,
                borderWidth: 1.5,
                borderRadius: chartType === 'bar' ? 4 : 0
            };
        });
        
        chartConfig.data = {
            labels: sortedX,
            datasets: datasets
        };
    } else {
        // Single-series data
        const labels = subset.map(row => getXLabel(row));
        const data = subset.map(row => parseFloat(row[yIdx]) || 0);
        
        chartConfig.data = {
            labels: labels,
            datasets: [{
                label: yCol,
                data: data,
                backgroundColor: isPie ? colors : colors[0],
                borderColor: isPie ? borderColors : borderColors[0],
                borderWidth: 1.5,
                borderRadius: chartType === 'bar' ? 4 : 0
            }]
        };
    }
    
    chartInstance = new Chart(ctx, chartConfig);
}

// Switch Tabs
function switchTab(tabId) {
    activeTab = tabId;
    
    // Toggle active tab buttons
    document.getElementById('tab-btn-explorer').classList.toggle('active', tabId === 'explorer');
    document.getElementById('tab-btn-playground').classList.toggle('active', tabId === 'playground');
    document.getElementById('btn-guide').classList.toggle('active', tabId === 'guide');
    
    // Toggle tab panels
    document.getElementById('panel-explorer').classList.toggle('active', tabId === 'explorer');
    document.getElementById('panel-playground').classList.toggle('active', tabId === 'playground');
    document.getElementById('panel-guide').classList.toggle('active', tabId === 'guide');
    
    if (tabId === 'explorer') {
        renderBrowseData();
    }
}

// Switch Results tab inside Playground (Table vs Chart)
function switchResultTab(subTab) {
    document.getElementById('res-tab-table').classList.toggle('active', subTab === 'table');
    document.getElementById('res-tab-chart').classList.toggle('active', subTab === 'chart');
    
    document.getElementById('result-view-table').classList.toggle('active', subTab === 'table');
    document.getElementById('result-view-chart').classList.toggle('active', subTab === 'chart');
    
    if (subTab === 'chart' && chartInstance) {
        // Redraw to fit container size
        chartInstance.resize();
    }
}

// Switch step contents in Local Setup Guide
function showGuideStep(stepNum) {
    // Update active state in step buttons
    for (let i = 1; i <= 4; i++) {
        const btn = document.getElementById(`guide-step-btn-${i}`);
        const content = document.getElementById(`guide-content-${i}`);
        
        if (i === stepNum) {
            btn.classList.add('active');
            content.classList.add('active');
        } else {
            btn.classList.remove('active');
            content.classList.remove('active');
        }
    }
}

// Role-based Access Control
function applyRoleAccess() {
    const isExecutive = currentUser && currentUser.role === 'executive';
    
    els.sqlEditor.readOnly = isExecutive;
    
    const runBtn = document.getElementById('btn-run-query');
    if (runBtn) {
        runBtn.disabled = isExecutive;
        if (isExecutive) {
            runBtn.style.opacity = '0.5';
            runBtn.style.cursor = 'not-allowed';
            runBtn.title = 'Unauthorized to run custom SQL. Switch to Analyst role to write/execute SQL queries.';
        } else {
            runBtn.style.opacity = '1';
            runBtn.style.cursor = 'pointer';
            runBtn.title = '';
        }
    }

    const saveTaskBtn = document.getElementById('btn-save-task');
    if (saveTaskBtn) {
        saveTaskBtn.disabled = isExecutive;
        if (isExecutive) {
            saveTaskBtn.style.opacity = '0.5';
            saveTaskBtn.style.cursor = 'not-allowed';
            saveTaskBtn.title = 'Unauthorized to save custom SQL tasks.';
        } else {
            saveTaskBtn.style.opacity = '1';
            saveTaskBtn.style.cursor = 'pointer';
            saveTaskBtn.title = '';
        }
    }
    
    if (isExecutive) {
        setDialect('sqlite');
        els.sqlEditor.placeholder = "Read-Only Access. Choose a preloaded task from the sidebar list to inspect query structures.";
    } else {
        els.sqlEditor.placeholder = "SELECT * FROM hrdata LIMIT 10;";
    }
}

// Auth Tab Switcher
function switchAuthTab(tab) {
    const signinForm = document.getElementById('signin-form');
    const signupForm = document.getElementById('signup-form');
    const tabSignin = document.getElementById('tab-signin');
    const tabSignup = document.getElementById('tab-signup');

    if (tab === 'signin') {
        signinForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        tabSignin.classList.add('active');
        tabSignup.classList.remove('active');
    } else {
        signinForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        tabSignin.classList.remove('active');
        tabSignup.classList.add('active');
        // Hide any previous signup feedback
        document.getElementById('signup-error').classList.add('hidden');
        document.getElementById('signup-success').classList.add('hidden');
    }
    lucide.createIcons();
}


// Sign In

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const errorMsgEl = document.getElementById('login-error-msg');

    const users = getUserStore();
    const match = users.find(u => u.email === email && u.password === password);

    if (match) {
        errorEl.classList.add('hidden');
        const session = { name: match.name, email: match.email, role: match.role };
        localStorage.setItem('sql_arena_session', JSON.stringify(session));
        currentUser = session;
        showDashboard();
    } else {
        errorEl.classList.remove('hidden');
        errorMsgEl.textContent = 'No account found with those credentials. Please check your email and password, or sign up.';
        lucide.createIcons();
    }
}

// Sign Up
function handleSignup(event) {
    event.preventDefault();
    const name     = document.getElementById('signup-name').value.trim();
    const email    = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;
    const role     = 'analyst'; // All self-registered users get full BI Analyst access
    const errorEl   = document.getElementById('signup-error');
    const errorMsgEl = document.getElementById('signup-error-msg');
    const successEl  = document.getElementById('signup-success');

    if (password.length < 6) {
        errorEl.classList.remove('hidden');
        errorMsgEl.textContent = 'Password must be at least 6 characters.';
        successEl.classList.add('hidden');
        lucide.createIcons();
        return;
    }

    const users = getUserStore();
    if (users.find(u => u.email === email)) {
        errorEl.classList.remove('hidden');
        errorMsgEl.textContent = 'An account with this email already exists. Please sign in.';
        successEl.classList.add('hidden');
        lucide.createIcons();
        return;
    }

    users.push({ name, email, password, role });
    saveUserStore(users);

    errorEl.classList.add('hidden');
    successEl.classList.remove('hidden');
    lucide.createIcons();

    // Auto-switch to sign-in after 1.5 s
    setTimeout(() => switchAuthTab('signin'), 1500);
}

// Sign Out
function handleLogout() {
    localStorage.removeItem('sql_arena_session');
    currentUser = null;
    if (db) db = null;
    location.reload();
}

// Upload Modal Handlers
function triggerDatasetUpload() {
    document.getElementById('upload-modal').classList.remove('hidden');
    // Reset inputs
    document.getElementById('file-input').value = '';
    document.getElementById('upload-details').classList.add('hidden');
    document.getElementById('upload-dropzone').classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
}

function handleModalOverlayClick(event) {
    if (event.target.id === 'upload-modal') {
        closeUploadModal();
    }
}

function triggerFileSelect() {
    document.getElementById('file-input').click();
}

// Temporary file data holder
let tempFileData = null;

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processUploadedFile(file);
    }
}

function processUploadedFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
        parseUploadedExcel(file);
    } else if (ext === 'csv') {
        parseUploadedCSV(file);
    } else {
        alert('Unsupported file type. Please upload a .csv, .xlsx, or .xls file.');
    }
}

// Setup drag and drop events
function setupDragAndDrop() {
    const dropzone = document.getElementById('upload-dropzone');
    if (!dropzone) return;

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            processUploadedFile(file);
        }
    });
}

function parseUploadedExcel(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            if (workbook.SheetNames.length === 0) {
                alert('The Excel workbook contains no sheets.');
                return;
            }
            
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            if (rows.length === 0) {
                alert('The Excel sheet is empty.');
                return;
            }
            
            const firstRow = rows[0];
            const columns = Object.keys(firstRow);
            const schema = columns.map(col => {
                let type = 'TEXT';
                for (let i = 0; i < Math.min(rows.length, 20); i++) {
                    if (rows[i] && rows[i][col] !== undefined && rows[i][col] !== null && rows[i][col] !== '') {
                        const val = String(rows[i][col]).trim();
                        if (val !== '' && !isNaN(val)) {
                            if (val.includes('.')) {
                                type = 'REAL';
                            } else {
                                type = 'INTEGER';
                            }
                        }
                        break;
                    }
                }
                return { name: col, type: type, desc: `User uploaded column "${col}"` };
            });
            
            const cleanName = file.name.replace(/\.[^/.]+$/, "")
                                       .toLowerCase()
                                       .replace(/[^a-z0-9_]/g, '_');
            
            tempFileData = {
                name: file.name.replace(/\.[^/.]+$/, ""),
                tableName: cleanName,
                schema: schema,
                rows: rows
            };
            
            document.getElementById('dataset-name').value = cleanName;
            document.getElementById('preview-row-count').textContent = rows.length.toLocaleString();
            document.getElementById('preview-col-count').textContent = columns.length;
            
            const tbody = document.getElementById('preview-schema-tbody');
            tbody.innerHTML = '';
            schema.forEach(col => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><code>${col.name}</code></td>
                    <td><span class="badge">${col.type}</span></td>
                `;
                tbody.appendChild(tr);
            });
            
            document.getElementById('upload-dropzone').classList.add('hidden');
            document.getElementById('upload-details').classList.remove('hidden');
            lucide.createIcons();
        } catch (err) {
            alert('Failed to parse Excel file: ' + err.message);
        }
    };
    reader.onerror = function() {
        alert('Failed to read Excel file.');
    };
    reader.readAsArrayBuffer(file);
}


function parseUploadedCSV(file) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            const data = results.data;
            if (data.length === 0) {
                alert('The uploaded CSV file is empty.');
                return;
            }

            // Inferred schema
            const firstRow = data[0];
            const columns = Object.keys(firstRow);
            const schema = columns.map(col => {
                let type = 'TEXT';
                for (let i = 0; i < Math.min(data.length, 20); i++) {
                    if (data[i] && data[i][col] !== undefined && data[i][col] !== null && data[i][col] !== '') {
                        const val = data[i][col].trim();
                        if (val !== '' && !isNaN(val)) {
                            if (val.includes('.')) {
                                type = 'REAL';
                            } else {
                                type = 'INTEGER';
                            }
                        }
                        break;
                    }
                }
                return { name: col, type: type, desc: `User uploaded column "${col}"` };
            });

            const cleanName = file.name.replace(/\.[^/.]+$/, "")
                                       .toLowerCase()
                                       .replace(/[^a-z0-9_]/g, '_');

            tempFileData = {
                name: file.name.replace(/\.[^/.]+$/, ""),
                tableName: cleanName,
                schema: schema,
                rows: data
            };

            document.getElementById('dataset-name').value = cleanName;
            document.getElementById('preview-row-count').textContent = data.length.toLocaleString();
            document.getElementById('preview-col-count').textContent = columns.length;

            const tbody = document.getElementById('preview-schema-tbody');
            tbody.innerHTML = '';
            schema.forEach(col => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><code>${col.name}</code></td>
                    <td><span class="badge">${col.type}</span></td>
                `;
                tbody.appendChild(tr);
            });

            document.getElementById('upload-dropzone').classList.add('hidden');
            document.getElementById('upload-details').classList.remove('hidden');
            lucide.createIcons();
        },
        error: function(err) {
            alert('Failed to parse CSV file: ' + err.message);
        }
    });
}

function validateTableName(input) {
    input.value = input.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function confirmDatasetUpload() {
    if (!tempFileData) return;

    const tableNameInput = document.getElementById('dataset-name').value.trim();
    if (!tableNameInput) {
        alert('Please enter a valid table name.');
        return;
    }

    const reserved = ['hrdata', 'car_sales', 'call_center'];
    if (reserved.includes(tableNameInput) || projects[tableNameInput]) {
        alert('This table name is reserved for default projects. Please choose another name.');
        return;
    }

    const exists = uploadedDatasets.some(d => d.tableName === tableNameInput);
    if (exists) {
        alert('A dataset with this table name already exists. Please choose a different name.');
        return;
    }

    tempFileData.tableName = tableNameInput;
    tempFileData.id = 'custom_' + Date.now();

    try {
        createAndPopulateTable(tempFileData.tableName, tempFileData.schema, tempFileData.rows);
        uploadedDatasets.push(tempFileData);
        
        saveCustomDatasetsToStorage();
        
        renderCustomDatasetList();
        closeUploadModal();
        switchProject(tempFileData.id);
    } catch (err) {
        alert('Failed to import dataset into SQLite: ' + err.message);
    }
}

function renderCustomDatasetList() {
    const listEl = document.getElementById('custom-datasets-list');
    if (!listEl) return;

    if (uploadedDatasets.length === 0) {
        listEl.innerHTML = '<p class="no-datasets-hint">No datasets yet.<br>Click + to upload a CSV.</p>';
        return;
    }

    listEl.innerHTML = '';
    uploadedDatasets.forEach(d => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `custom-dataset-item ${activeProject === d.id ? 'active' : ''}`;
        itemDiv.id = `custom-item-${d.id}`;
        
        itemDiv.innerHTML = `
            <button class="custom-dataset-btn" onclick="switchProject('${d.id}')">
                <i data-lucide="database"></i>
                <span>${d.name}</span>
            </button>
            <button class="custom-dataset-delete" onclick="deleteCustomDataset('${d.id}', event)" title="Delete dataset">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        listEl.appendChild(itemDiv);
    });
    
    lucide.createIcons();
}

function updateCustomDatasetListUI() {
    const items = document.querySelectorAll('.custom-dataset-item');
    items.forEach(item => {
        if (item.id === `custom-item-${activeProject}`) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function deleteCustomDataset(id, event) {
    if (event) event.stopPropagation();
    
    const index = uploadedDatasets.findIndex(d => d.id === id);
    if (index === -1) return;
    
    const dataset = uploadedDatasets[index];
    if (confirm(`Are you sure you want to delete the dataset "${dataset.name}"? This will drop the SQLite table "${dataset.tableName}".`)) {
        try {
            db.run(`DROP TABLE IF EXISTS "${dataset.tableName}"`);
            
            // Clean up custom saved queries mapped to this dataset
            const allSaved = JSON.parse(localStorage.getItem('sql_arena_saved_tasks') || '{}');
            if (allSaved[id]) {
                delete allSaved[id];
                localStorage.setItem('sql_arena_saved_tasks', JSON.stringify(allSaved));
            }
        } catch (e) {
            console.error('Error dropping table:', e);
        }
        
        uploadedDatasets.splice(index, 1);
        saveCustomDatasetsToStorage();
        renderCustomDatasetList();
        
        if (activeProject === id) {
            switchProject('hr');
        }
    }
}

async function loadSampleDataset(event) {
    if (event) {
        event.stopPropagation();
    }
    try {
        const response = await fetch('./test_sales.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                const data = results.data;
                if (data.length === 0) {
                    alert('The sample CSV file is empty.');
                    return;
                }

                // Inferred schema
                const firstRow = data[0];
                const columns = Object.keys(firstRow);
                const schema = columns.map(col => {
                    let type = 'TEXT';
                    for (let i = 0; i < Math.min(data.length, 20); i++) {
                        if (data[i] && data[i][col] !== undefined && data[i][col] !== null && data[i][col] !== '') {
                            const val = data[i][col].trim();
                            if (val !== '' && !isNaN(val)) {
                                if (val.includes('.')) {
                                    type = 'REAL';
                                } else {
                                    type = 'INTEGER';
                                }
                            }
                            break;
                        }
                    }
                    return { name: col, type: type, desc: `User uploaded column "${col}"` };
                });

                tempFileData = {
                    name: 'test_sales',
                    tableName: 'test_sales',
                    schema: schema,
                    rows: data
                };

                document.getElementById('dataset-name').value = 'test_sales';
                document.getElementById('preview-row-count').textContent = data.length.toLocaleString();
                document.getElementById('preview-col-count').textContent = columns.length;

                const tbody = document.getElementById('preview-schema-tbody');
                tbody.innerHTML = '';
                schema.forEach(col => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><code>${col.name}</code></td>
                        <td><span class="badge">${col.type}</span></td>
                    `;
                    tbody.appendChild(tr);
                });

                document.getElementById('upload-dropzone').classList.add('hidden');
                document.getElementById('upload-details').classList.remove('hidden');
                lucide.createIcons();
            },
            error: function(err) {
                alert('Failed to parse CSV file: ' + err.message);
            }
        });
    } catch (err) {
        alert('Failed to fetch sample dataset: ' + err.message);
    }
}

// Save Query Task Modal Handlers
function openSaveTaskModal() {
    const isExecutive = currentUser && currentUser.role === 'executive';
    if (isExecutive) {
        alert('Unauthorized to save SQL tasks.');
        return;
    }
    
    const query = els.sqlEditor.value.trim();
    if (!query) {
        alert('Please write a SQL query in the editor first before saving it as a task.');
        return;
    }
    
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('save-task-modal').classList.remove('hidden');
}

function closeSaveTaskModal() {
    document.getElementById('save-task-modal').classList.add('hidden');
}

function handleSaveTaskModalOverlayClick(event) {
    if (event.target.id === 'save-task-modal') {
        closeSaveTaskModal();
    }
}

function confirmSaveQueryAsTask() {
    const title = document.getElementById('task-title').value.trim();
    const desc = document.getElementById('task-desc').value.trim();
    const queryText = els.sqlEditor.value.trim();
    
    if (!title) {
        alert('Please enter a task title.');
        return;
    }
    
    if (!queryText) {
        alert('Cannot save an empty query task.');
        return;
    }
    
    const newTask = {
        title: title,
        desc: desc || `Custom query task: ${title}`,
        sqlite: queryText,
        original: queryText
    };
    
    saveQueryAsTask(activeProject, newTask);
    
    // Refresh the task list in UI
    const proj = getProject(activeProject);
    renderPreloadedQueries(proj.queries);
    
    // Select the newly created task (which is the last item)
    const newIndex = proj.queries.length - 1;
    loadPreloadedQuery(newIndex);
    
    closeSaveTaskModal();
}

// Export to window for inline HTML listeners
window.handleLogin    = handleLogin;
window.handleSignup   = handleSignup;
window.handleLogout   = handleLogout;
window.switchAuthTab  = switchAuthTab;
window.triggerDatasetUpload = triggerDatasetUpload;
window.closeUploadModal = closeUploadModal;
window.handleModalOverlayClick = handleModalOverlayClick;
window.triggerFileSelect = triggerFileSelect;
window.handleFileSelect = handleFileSelect;
window.confirmDatasetUpload = confirmDatasetUpload;
window.validateTableName = validateTableName;
window.deleteCustomDataset = deleteCustomDataset;
window.loadSampleDataset = loadSampleDataset;
window.openSaveTaskModal = openSaveTaskModal;
window.closeSaveTaskModal = closeSaveTaskModal;
window.handleSaveTaskModalOverlayClick = handleSaveTaskModalOverlayClick;
window.confirmSaveQueryAsTask = confirmSaveQueryAsTask;

// Core playground exports for module environments
window.switchProject = switchProject;
window.switchTab = switchTab;
window.executeCurrentQuery = executeCurrentQuery;
window.setDialect = setDialect;
window.switchResultTab = switchResultTab;
window.browsePrevPage = browsePrevPage;
window.browseNextPage = browseNextPage;
window.loadPreloadedQuery = loadPreloadedQuery;
window.showGuideStep = showGuideStep;

// Start initialization on page load
window.addEventListener('DOMContentLoaded', init);
