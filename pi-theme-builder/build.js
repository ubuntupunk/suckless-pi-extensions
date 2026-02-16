import * as sass from 'sass';
import chokidar from 'chokidar';
import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import { exec } from 'child_process';

// Configuration
const THEME_NAME = 'my-custom-theme';
const INPUT_SCSS = './src/theme.scss';
const OUTPUT_JSON = `../.pi/themes/${THEME_NAME}.json`; // Saves directly to your Pi project
const PREVIEW_DIR = './preview';
const PREVIEW_CSS = './preview/style.css';

// Ensure directories exist
fs.ensureDirSync(path.dirname(OUTPUT_JSON));
fs.ensureDirSync(PREVIEW_DIR);

// Pi Theme Schema Keys (The required 51 tokens)
const REQUIRED_KEYS = [
    "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", 
    "muted", "dim", "text", "thinkingText", "selectedBg", "userMessageBg", 
    "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel", 
    "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput", 
    "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", 
    "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet", "toolDiffAdded", 
    "toolDiffRemoved", "toolDiffContext", "syntaxComment", "syntaxKeyword", 
    "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", 
    "syntaxOperator", "syntaxPunctuation", "thinkingOff", "thinkingMinimal", 
    "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "bashMode"
];

const compile = () => {
    try {
        console.log('🎨 Compiling SCSS...');
        
        // 1. Compile SCSS to CSS
        const result = sass.compile(INPUT_SCSS, { style: 'expanded' });
        const css = result.css;

        // 2. Write CSS for the HTML Preview
        fs.writeFileSync(PREVIEW_CSS, css);

        // 3. Parse CSS Variables to build JSON
        // We look for the :root { ... } block and extract --key: value;
        const colors = {};
        REQUIRED_KEYS.forEach(key => {
            // Regex to find --key: #val or rgb(..) or color;
            const regex = new RegExp(`--${key}:\\s*([^;]+);`);
            const match = css.match(regex);
            if (match) {
                colors[key] = match[1].trim();
            } else {
                console.warn(`⚠️  Missing token in SCSS: --${key}`);
                colors[key] = "#FF00FF"; // Debug pink for missing
            }
        });

        // 4. Construct JSON Object
        const themeJson = {
            name: THEME_NAME,
            colors: colors
        };

        // 5. Write JSON to Pi's theme directory
        fs.writeFileSync(OUTPUT_JSON, JSON.stringify(themeJson, null, 2));
        
        console.log(`✅ Theme updated: ${OUTPUT_JSON}`);
        console.log(`✨ Preview updated: ${PREVIEW_CSS}`);

    } catch (err) {
        console.error('❌ Compilation Error:', err.message);
    }
};

// Start Server for Preview
const server = http.createServer((req, res) => {
    // API: GET /api/variables
    if (req.method === 'GET' && req.url === '/api/variables') {
        try {
            const scssContent = fs.readFileSync(INPUT_SCSS, 'utf-8');
            const variables = {};
            const regex = /^\s*\$([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*;/gm;
            let match;
            while ((match = regex.exec(scssContent)) !== null) {
                variables[match[1]] = match[2];
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(variables));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: POST /api/variables
    if (req.method === 'POST' && req.url === '/api/variables') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const updates = JSON.parse(body);
                let scssContent = fs.readFileSync(INPUT_SCSS, 'utf-8');
                
                // Update variables in SCSS content
                for (const [key, value] of Object.entries(updates)) {
                    // Look for $key: value; (ignoring whitespace)
                    const regex = new RegExp(`^\\s*\\$${key}\\s*:\\s*(.+?)\\s*;`, 'm');
                    if (regex.test(scssContent)) {
                        scssContent = scssContent.replace(regex, `$${key}: ${value};`);
                    }
                }
                
                fs.writeFileSync(INPUT_SCSS, scssContent);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: POST /api/compile
    if (req.method === 'POST' && req.url === '/api/compile') {
        compile();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Serve from the preview directory
    let filePath = path.join('./preview', req.url === '/' ? 'index.html' : req.url);
    
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.css': contentType = 'text/css'; break;
        case '.js': contentType = 'text/javascript'; break;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end(`File not found: ${req.url}`);
            } else {
                res.writeHead(500);
                res.end(`Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const startServer = (port) => {
    server.once('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error(e);
        }
    });

    server.listen(port, () => {
        console.log(`🌍 Preview running at http://localhost:${port}`);
        // Open browser
        const start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
        exec(`${start} http://localhost:${port}`);
    });
};

// Watch
chokidar.watch('./src/**/*.scss').on('change', compile);
compile();

startServer(3000);
