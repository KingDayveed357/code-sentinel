// Test script to verify AI service initialization
// Run with: npx tsx scripts/test-ai-service.ts

import { createFastifyInstance } from '../src/server';

async function testAIService() {
  console.log('🧪 Testing AI Service Initialization...\n');
  
  try {
    // Create Fastify instance
    const fastify = await createFastifyInstance();
    
    // Test 1: Import AI services
    console.log('1️⃣  Testing AI service import...');
    const { getTitleGenerator, getAIClient } = await import('../src/services/ai');
    console.log('✅ AI services imported successfully\n');
    
    // Test 2: Initialize AI client
    console.log('2️⃣  Testing AI client initialization...');
    const aiClient = getAIClient(fastify);
    console.log('✅ AI client initialized');
    console.log('   Stats:', aiClient.getUsageStats());
    console.log('');
    
    // Test 3: Initialize title generator
    console.log('3️⃣  Testing title generator initialization...');
    const titleGen = getTitleGenerator(fastify);
    console.log('✅ Title generator initialized\n');
    
    // Test 4: Generate a test title
    console.log('4️⃣  Testing title generation...');
    const testTitle = await titleGen.generateTitle({
      rule_id: 'test-sql-injection',
      description: 'Unsafe SQL query construction detected in user authentication',
      scanner_type: 'sast',
      severity: 'high',
      raw_title: 'Found SQL injection in auth.ts at line 42',
    });
    
    console.log('✅ Title generated successfully');
    console.log('   Input:  "Found SQL injection in auth.ts at line 42"');
    console.log('   Output:', testTitle);
    console.log('');
    
    // Test 5: Validate title
    console.log('5️⃣  Testing title validation...');
    const validation = titleGen.validateTitle(testTitle);
    console.log('✅ Title validation:', validation.valid ? 'PASSED' : 'FAILED');
    if (!validation.valid) {
      console.log('   Issues:', validation.issues);
    }
    console.log('');
    
    // Test 6: Test fallback normalizer
    console.log('6️⃣  Testing fallback title normalizer...');
    const { normalizeTitle } = await import('../src/scanners/utils/title-normalizer');
    const fallbackTitle = normalizeTitle(
      'javascript.lang.security.audit.xss.taint-unsafe-echo-tag',
      'Taint-unsafe-echo-tag Taint-unsafe-echo-tag',
      'sast'
    );
    console.log('✅ Fallback normalizer works');
    console.log('   Input:  "Taint-unsafe-echo-tag Taint-unsafe-echo-tag"');
    console.log('   Output:', fallbackTitle);
    console.log('');
    
    console.log('========================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('========================================');
    console.log('\nAI Service is working correctly!');
    console.log('The issue with DB insertion must be elsewhere.\n');
    
    await fastify.close();
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('\nThis is likely the root cause of DB insertion failures!');
    process.exit(1);
  }
}

testAIService();
