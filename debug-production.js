#!/usr/bin/env node

/**
 * Cortaí Production Diagnostic Script
 * 
 * Tests each part of the production pipeline to identify issues:
 * 1. Workers API Health Check
 * 2. Supabase Functions Status
 * 3. SSE Connection Test
 * 4. End-to-End Pipeline Test
 */

const fetch = require('node-fetch');

// Configuration from your production environment
const CONFIG = {
  SUPABASE_URL: 'https://qibjqqucmbrtuirysexl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpYmpxcXVjbWJydHVpcnlzZXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2Mzg3OTYsImV4cCI6MjA3MjIxNDc5Nn0.afpoQtOXH62pi5LuC8lOXPmxnx71Nn3BJBXXtVzp3Os',
  
  // You need to fill these from your Render/Railway deployment
  WORKERS_API_URL: 'YOUR_WORKERS_API_URL', // e.g., https://your-workers.onrender.com
  WORKERS_API_KEY: 'YOUR_WORKERS_API_KEY',
  
  // Test YouTube URL (short enough for quick testing)
  TEST_YOUTUBE_URL: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  
  // Mock auth token (for testing - replace with real one if needed)
  TEST_AUTH_TOKEN: 'mock_token_for_testing'
};

// Color console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) { log(colors.green, `✅ ${message}`); }
function error(message) { log(colors.red, `❌ ${message}`); }
function warning(message) { log(colors.yellow, `⚠️  ${message}`); }
function info(message) { log(colors.blue, `ℹ️  ${message}`); }
function step(message) { log(colors.magenta, `🔄 ${message}`); }

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Workers API Health Check
async function testWorkersAPIHealth() {
  step('Testing Workers API Health...');
  
  if (!CONFIG.WORKERS_API_URL || CONFIG.WORKERS_API_URL === 'YOUR_WORKERS_API_URL') {
    error('WORKERS_API_URL not configured! Please set it in the script.');
    return false;
  }
  
  try {
    const response = await fetch(`${CONFIG.WORKERS_API_URL}/health`, {
      method: 'GET',
      headers: CONFIG.WORKERS_API_KEY ? { 'x-api-key': CONFIG.WORKERS_API_KEY } : {},
      timeout: 10000
    });
    
    if (response.ok) {
      const data = await response.text();
      success(`Workers API is healthy: ${data}`);
      return true;
    } else {
      error(`Workers API returned ${response.status}: ${response.statusText}`);
      return false;
    }
  } catch (err) {
    error(`Workers API connection failed: ${err.message}`);
    
    // Provide debugging info
    warning('Possible issues:');
    console.log('  - Workers not deployed to production');
    console.log('  - WORKERS_API_URL incorrect');
    console.log('  - Workers API key missing/incorrect');
    console.log('  - Network connectivity issues');
    
    return false;
  }
}

// Test 2: Supabase Functions Status
async function testSupabaseFunctions() {
  step('Testing Supabase Functions...');
  
  try {
    // Test enqueue-pipeline function
    const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/enqueue-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CONFIG.TEST_AUTH_TOKEN}`
      },
      body: JSON.stringify({
        youtubeUrl: CONFIG.TEST_YOUTUBE_URL,
        neededMinutes: 1
      }),
      timeout: 15000
    });
    
    const data = await response.text();
    
    if (response.status === 401) {
      warning('Supabase Functions require valid authentication');
      info('This is expected - authentication check passed');
      return true;
    } else if (response.status === 500 && data.includes('workers_api_not_configured')) {
      error('Supabase Functions cannot reach Workers API');
      warning('WORKERS_API_URL or WORKERS_API_KEY not set in Supabase environment');
      return false;
    } else if (response.ok) {
      success('Supabase Functions are working');
      return true;
    } else {
      warning(`Supabase Functions returned ${response.status}: ${data}`);
      return response.status < 500; // 4xx is OK, 5xx is not
    }
  } catch (err) {
    error(`Supabase Functions test failed: ${err.message}`);
    return false;
  }
}

// Test 3: SSE Connection Test
async function testSSEConnection() {
  step('Testing SSE Connection...');
  
  try {
    // Test direct SSE endpoint
    const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/job-stream?id=test-job&token=${CONFIG.TEST_AUTH_TOKEN}`, {
      method: 'GET',
      timeout: 10000
    });
    
    if (response.status === 401) {
      warning('SSE requires valid authentication');
      info('This is expected - authentication check passed');
      return true;
    } else if (response.status === 500) {
      const data = await response.text();
      if (data.includes('workers_api_not_configured')) {
        error('SSE cannot reach Workers API');
        return false;
      }
    } else if (response.ok) {
      success('SSE endpoint is responsive');
      return true;
    }
    
    warning(`SSE test returned ${response.status}`);
    return response.status < 500;
  } catch (err) {
    error(`SSE connection test failed: ${err.message}`);
    return false;
  }
}

// Test 4: Redis/Queue Health (if possible)
async function testQueueHealth() {
  step('Testing Queue Health...');
  
  if (!CONFIG.WORKERS_API_URL || CONFIG.WORKERS_API_URL === 'YOUR_WORKERS_API_URL') {
    warning('Skipping queue test - Workers API URL not configured');
    return null;
  }
  
  try {
    const response = await fetch(`${CONFIG.WORKERS_API_URL}/api/health/queue`, {
      method: 'GET',
      headers: CONFIG.WORKERS_API_KEY ? { 'x-api-key': CONFIG.WORKERS_API_KEY } : {},
      timeout: 10000
    });
    
    if (response.ok) {
      const data = await response.json();
      success(`Queue is healthy: ${JSON.stringify(data)}`);
      return true;
    } else {
      error(`Queue health check failed: ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Queue health test failed: ${err.message}`);
    return false;
  }
}

// Test 5: Environment Variables Check
async function testEnvironmentVariables() {
  step('Checking Environment Variables...');
  
  const requiredVars = [
    'WORKERS_API_URL',
    'WORKERS_API_KEY'
  ];
  
  let allConfigured = true;
  
  for (const varName of requiredVars) {
    if (!CONFIG[varName] || CONFIG[varName].startsWith('YOUR_')) {
      error(`${varName} not configured in script`);
      allConfigured = false;
    } else {
      success(`${varName} is configured`);
    }
  }
  
  if (!allConfigured) {
    warning('Please update the CONFIG object in this script with your production values');
  }
  
  return allConfigured;
}

// Main diagnostic function
async function runDiagnostics() {
  console.log(`${colors.cyan}🔍 Cortaí Production Diagnostics${colors.reset}\n`);
  
  const results = {};
  
  // Run all tests
  results.envVars = await testEnvironmentVariables();
  await sleep(1000);
  
  results.workersAPI = await testWorkersAPIHealth();
  await sleep(1000);
  
  results.supabaseFunctions = await testSupabaseFunctions();
  await sleep(1000);
  
  results.sseConnection = await testSSEConnection();
  await sleep(1000);
  
  results.queueHealth = await testQueueHealth();
  
  // Summary
  console.log(`\n${colors.cyan}📊 Diagnostic Summary${colors.reset}`);
  
  let passedTests = 0;
  let totalTests = 0;
  
  Object.entries(results).forEach(([test, result]) => {
    if (result !== null) {
      totalTests++;
      if (result) passedTests++;
      
      const status = result ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${test}: ${status}`);
    }
  });
  
  console.log(`\nScore: ${passedTests}/${totalTests} tests passed\n`);
  
  // Recommendations
  if (!results.workersAPI) {
    console.log(`${colors.yellow}🛠️  PRIORITY FIX:${colors.reset}`);
    console.log('  1. Deploy workers to production (Render/Railway)');
    console.log('  2. Set WORKERS_API_URL environment variable in Supabase');
    console.log('  3. Set WORKERS_API_KEY environment variable in Supabase');
  } else if (!results.queueHealth) {
    console.log(`${colors.yellow}🛠️  PRIORITY FIX:${colors.reset}`);
    console.log('  1. Configure Redis connection in workers');
    console.log('  2. Check workers environment variables');
  } else {
    console.log(`${colors.green}🎉 System appears to be working!${colors.reset}`);
  }
  
  return results;
}

// Configuration helper
function printConfigurationHelp() {
  console.log(`\n${colors.cyan}⚙️  Configuration Help${colors.reset}`);
  console.log('\nTo use this diagnostic script:');
  console.log('1. Update CONFIG object with your production values');
  console.log('2. Set WORKERS_API_URL (your deployed workers URL)');
  console.log('3. Set WORKERS_API_KEY (from your environment)');
  console.log('\nExample:');
  console.log('  WORKERS_API_URL: "https://your-app.onrender.com"');
  console.log('  WORKERS_API_KEY: "your-secret-key"');
}

// Run the diagnostics
if (require.main === module) {
  runDiagnostics()
    .then(() => {
      if (CONFIG.WORKERS_API_URL === 'YOUR_WORKERS_API_URL') {
        printConfigurationHelp();
      }
    })
    .catch(err => {
      error(`Diagnostic failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { runDiagnostics, CONFIG };
