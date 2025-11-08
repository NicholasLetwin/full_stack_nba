// list-models.js
import 'dotenv/config';

async function main() {
  try {
    console.log('=== AVAILABLE MODELS ===\n');
    
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.error('❌ GOOGLE_API_KEY not found in environment');
      return;
    }
    
    console.log('Fetching models...\n');
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    
    console.log('Raw response:', JSON.stringify(data, null, 2));
    
    const models = data.models || [];
    
    console.log(`\n=== FOUND ${models.length} MODELS ===\n`);
    
    for (const m of models) {
      const supportsGen =
        (m.supportedGenerationMethods || []).includes('generateContent');
      console.log(
        `${m.name}\n` +
        `  Generate: ${supportsGen}\n` +
        `  Input: ${m.inputTokenLimit ?? '-'}\n` +
        `  Output: ${m.outputTokenLimit ?? '-'}\n`
      );
    }
    
  } catch (e) {
    console.error('ERROR listing models:', e.message);
    console.error('Full error:', e);
  }
}

main();