const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

// Parse args
const args = process.argv.slice(2);
const params = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const val = args[i + 1];
    params[key] = val;
    i++;
  }
}

const action = params.action;
const prompt = params.prompt;
const outputDir = params.outputDir;
const filePath = params.filePath;
const model = params.model || 'gemini-1.5-flash';

if (!action || !prompt) {
  console.error('[GEMINI_WORKER] Error: missing --action or --prompt');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('[GEMINI_WORKER] Error: GEMINI_API_KEY or GOOGLE_API_KEY is not defined in the environment.');
  process.exit(1);
}

// Clean markdown wrappers from LLM output if present
function cleanJsonResponseText(text) {
  if (!text) return '';
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\r?\n/, '');
    cleaned = cleaned.replace(/\r?\n```$/, '');
  }
  return cleaned.trim();
}

function makeRequest(apiKey, model, payload) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const parsedUrl = url.parse(apiUrl);
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse response JSON: ${e.message}. Raw response: ${data}`));
          }
        } else {
          reject(new Error(`API responded with status ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  let systemInstruction = '';
  if (action === 'start') {
    systemInstruction = `You are a world-class senior software engineer at Google.
You write production-grade, modular, self-contained, clean code in standard JavaScript/Node.js, following all best practices.
You must return the generated files in a single JSON object format.
Schema:
{
  "files": {
    "relative/path/to/file.js": "file content here",
    ...
  }
}
Do not include any explanation or markdown formatting outside of the JSON. Respond with ONLY the raw JSON object.`;
  } else if (action === 'reanchor') {
    systemInstruction = `You are a world-class senior software engineer at Google.
Your task is to heal a drifted source file to align it with the project specifications.
You must return the complete rewritten file content inside a JSON object format.
Schema:
{
  "code": "entire file content here"
}
Do not include any explanation or markdown formatting outside of the JSON. Respond with ONLY the raw JSON object.`;
  }

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  console.log(`[GEMINI_WORKER] Calling Gemini API (${model}) for action: ${action}...`);

  try {
    const response = await makeRequest(apiKey, model, payload);
    const candidate = response.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;
    
    if (!rawText) {
      throw new Error('No content returned from Gemini API.');
    }

    const cleanedText = cleanJsonResponseText(rawText);
    const result = JSON.parse(cleanedText);

    if (action === 'start') {
      const files = result.files;
      if (!files || typeof files !== 'object') {
        throw new Error('Gemini response did not contain a "files" object.');
      }

      console.log(`[GEMINI_WORKER] Writing generated files to: ${outputDir}`);
      for (const [relPath, content] of Object.entries(files)) {
        const fullPath = path.resolve(outputDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`[GEMINI_WORKER] Generated ${relPath} (${content.length} bytes)`);
      }
      console.log('[GEMINI_WORKER] Project generation completed successfully.');

    } else if (action === 'reanchor') {
      const code = result.code;
      if (typeof code !== 'string') {
        throw new Error('Gemini response did not contain a "code" string.');
      }

      console.log(`[GEMINI_WORKER] Overwriting file: ${filePath}`);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, code, 'utf8');
      console.log(`[GEMINI_WORKER] File successfully re-anchored/healed.`);
    }

  } catch (error) {
    console.error(`[GEMINI_WORKER] Execution failed: ${error.message}`);
    process.exit(1);
  }
}

run();
