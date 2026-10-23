#!/usr/bin/env node
/**
 * Liara FlightDeck MCP Server (JSON-RPC 2.0 over stdio)
 * Exposes Liara PaaS & SRE Tools to Coding Agents (Cursor, Claude Desktop, Windsurf)
 */

const readline = require('readline');

const LIARA_TOKEN = process.env.LIARA_API_TOKEN || '';
const LIARA_BASE = 'https://api.liara.ir';

const TOOLS = [
    {
        name: 'liara_list_projects',
        description: 'دریافت لیست تمام پروژه‌ها و وضعیت سلامت سرویس‌ها در حساب لیارا',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'liara_create_project_hitl',
        description: 'ایجاد پروژه جدید در لیارا (نیازمند تایید کاربر Human-in-the-Loop)',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'شناسه انگلیسی برنامه در لیارا' },
                platform: { type: 'string', description: 'node | django | react | nextjs | docker | laravel' },
                planID: { type: 'string', description: 'ir-mini | ir-small | ir-medium' },
                userApproved: { type: 'boolean', description: 'آیا کاربر نهایی ایجاد هزینه و ساخت سرویس را تایید کرده است؟' }
            },
            required: ['name', 'platform', 'planID', 'userApproved']
        }
    },
    {
        name: 'liara_sre_fetch_logs',
        description: 'دریافت آخرین لاگ‌های اجرایی سرویس از لیارا برای عیب‌یابی خطاهای HTTP 500 و کندی',
        inputSchema: {
            type: 'object',
            properties: {
                appName: { type: 'string', description: 'نام پروژه در لیارا' }
            },
            required: ['appName']
        }
    },
    {
        name: 'liara_sre_restart_service',
        description: 'ری‌استارت امن سرویس در لیارا پس از تایید کاربر (Human-in-the-Loop)',
        inputSchema: {
            type: 'object',
            properties: {
                appName: { type: 'string' },
                userApproved: { type: 'boolean' }
            },
            required: ['appName', 'userApproved']
        }
    }
];

async function callLiara(path, method = 'GET', body = null) {
    if (!LIARA_TOKEN) {
        return { simulated: true, message: 'LIARA_API_TOKEN تنظیم نشده است. پاسخ شبیه‌سازی برگردانده شد.' };
    }
    const res = await fetch(`${LIARA_BASE}${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${LIARA_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    return await res.json();
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
        const req = JSON.parse(line);
        if (req.method === 'initialize') {
            sendResponse(req.id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'liara-flightdeck-mcp', version: '2.0.0' }
            });
        } else if (req.method === 'tools/list') {
            sendResponse(req.id, { tools: TOOLS });
        } else if (req.method === 'tools/call') {
            const { name, arguments: args } = req.params;
            if ((name === 'liara_create_project_hitl' || name === 'liara_sre_restart_service') && !args?.userApproved) {
                sendResponse(req.id, {
                    content: [{
                        type: 'text',
                        text: '⛔ توقف امنیتی (Human-in-the-Loop): این عملیات حساس است و نیاز به تایید مستقیم کاربر (userApproved: true) دارد.'
                    }]
                });
                return;
            }

            let result;
            if (name === 'liara_list_projects') {
                result = await callLiara('/v1/projects');
            } else if (name === 'liara_create_project_hitl') {
                result = await callLiara('/v1/projects', 'POST', {
                    name: args.name,
                    platform: args.platform,
                    planID: args.planID
                });
            } else if (name === 'liara_sre_fetch_logs') {
                result = await callLiara(`/v1/projects/${args.appName}/logs`);
            } else if (name === 'liara_sre_restart_service') {
                result = await callLiara(`/v1/projects/${args.appName}/actions/restart`, 'POST');
            }

            sendResponse(req.id, {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            });
        }
    } catch (e) {
        // Ignore malformed lines
    }
});

function sendResponse(id, result) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}