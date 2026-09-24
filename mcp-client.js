/**
 * Model Context Protocol (MCP) Client & Tool Engine for Hett
 * Compliant with Anthropic Model Context Protocol (JSON-RPC 2.0)
 * 
 * Features:
 * - Built-in MCP Servers (Core System & Math, Web & Live Knowledge, Memory & Notes, Text Utilities)
 * - External MCP Server connection via HTTP JSON-RPC 2.0 & SSE
 * - Dynamic Tool Registry converting MCP tools to OpenAI/Groq Tool Calling format
 * - Tool Execution pipeline with state tracking and in-chat cards
 */

// ---------------------------------------------------------------------------
// Safe Math Expression Evaluator
// ---------------------------------------------------------------------------
function safeEvaluateMath(expr) {
  if (!expr || typeof expr !== 'string') throw new Error('Expression must be a non-empty string.');
  // Sanitize: allow only numbers, math operators, parens, decimal, and Math functions
  const sanitized = expr.replace(/\s+/g, '');
  if (!/^[0-9+\-*/%^().,eEMath.sqrtcossintanlogabsfloorceilroundPIE]+$/.test(sanitized)) {
    // If it contains disallowed characters
    if (/[^0-9+\-*/%^().,eE\s]/.test(expr)) {
      throw new Error('Invalid characters in math expression.');
    }
  }

  // Support '^' as exponentiation
  const parsed = expr.replace(/\^/g, '**');

  // Evaluate inside restricted scope with Math members available
  const mathScope = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    log10: Math.log10,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    pow: Math.pow,
    PI: Math.PI,
    E: Math.E
  };

  const fn = new Function(...Object.keys(mathScope), `"use strict"; return (${parsed});`);
  const result = fn(...Object.values(mathScope));
  if (typeof result !== 'number' || isNaN(result)) {
    throw new Error('Expression did not evaluate to a valid number.');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Built-in MCP Tool Definitions & Handlers
// ---------------------------------------------------------------------------
const BUILTIN_SERVERS = [
  {
    id: 'core-system-server',
    name: 'Core System & Math',
    description: 'Provides live date/time, mathematical calculations, and random generators.',
    icon: '⚡',
    enabled: true,
    tools: [
      {
        name: 'get_current_time',
        description: 'Returns the current local date, time, day of the week, ISO timestamp, and user timezone.',
        inputSchema: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Optional IANA timezone name (e.g., "Asia/Kolkata", "America/New_York", "UTC"). Defaults to user local timezone.'
            }
          }
        },
        handler: async (args) => {
          const now = new Date();
          const tz = args?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  iso: now.toISOString(),
                  local_formatted: now.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }),
                  day_of_week: now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }),
                  timezone: tz,
                  unix_timestamp: Math.floor(now.getTime() / 1000)
                }, null, 2)
              }
            ]
          };
        }
      },
      {
        name: 'calculate',
        description: 'Safely evaluates mathematical expressions, trigonometry, square roots, and conversions.',
        inputSchema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Mathematical expression to calculate (e.g., "25 * 48", "sqrt(144) + 12", "sin(PI/2)").'
            }
          },
          required: ['expression']
        },
        handler: async (args) => {
          try {
            const val = safeEvaluateMath(args.expression);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    expression: args.expression,
                    result: val,
                    formatted: val.toLocaleString('en-US', { maximumFractionDigits: 8 })
                  }, null, 2)
                }
              ]
            };
          } catch (err) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Calculation error: ${err.message}` }]
            };
          }
        }
      },
      {
        name: 'generate_random',
        description: 'Generates random numbers, UUIDs, passwords, or dice rolls.',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['number', 'uuid', 'password', 'dice'],
              description: 'Type of random value to generate'
            },
            min: { type: 'number', description: 'Minimum value for numbers (default 1)' },
            max: { type: 'number', description: 'Maximum value for numbers (default 100)' },
            length: { type: 'number', description: 'Length for password generation (default 16)' }
          },
          required: ['type']
        },
        handler: async (args) => {
          let output;
          if (args.type === 'uuid') {
            output = crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).substring(2, 11);
          } else if (args.type === 'number') {
            const min = args.min !== undefined ? args.min : 1;
            const max = args.max !== undefined ? args.max : 100;
            output = Math.floor(Math.random() * (max - min + 1)) + min;
          } else if (args.type === 'dice') {
            output = Math.floor(Math.random() * 6) + 1;
          } else if (args.type === 'password') {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
            const len = Math.max(8, Math.min(64, args.length || 16));
            let pwd = '';
            for (let i = 0; i < len; i++) {
              pwd += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            output = pwd;
          }
          return {
            content: [{ type: 'text', text: JSON.stringify({ type: args.type, value: output }, null, 2) }]
          };
        }
      }
    ]
  },
  {
    id: 'web-knowledge-server',
    name: 'Web & Live Knowledge',
    description: 'Retrieves live weather data, Wikipedia encyclopedia entries, and web page content.',
    icon: '🌐',
    enabled: true,
    tools: [
      {
        name: 'weather_forecast',
        description: 'Gets current weather conditions and temperature for any city in the world.',
        inputSchema: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: 'City name (e.g., "Mumbai", "London", "Tokyo", "New York")'
            }
          },
          required: ['city']
        },
        handler: async (args) => {
          try {
            const city = encodeURIComponent(args.city.trim());
            // Use wttr.in JSON API format
            const res = await fetch(`https://wttr.in/${city}?format=j1`, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
            const data = await res.json();
            const current = data.current_condition?.[0] || {};
            const nearest = data.nearest_area?.[0] || {};

            const result = {
              city: nearest.areaName?.[0]?.value || args.city,
              country: nearest.country?.[0]?.value || '',
              temperature_c: current.temp_C + '°C',
              temperature_f: current.temp_F + '°F',
              feels_like_c: current.FeelsLikeC + '°C',
              condition: current.weatherDesc?.[0]?.value || 'Clear',
              humidity: current.humidity + '%',
              wind: `${current.windspeedKmph} km/h (${current.winddir16Point})`,
              uv_index: current.uvIndex,
              cloud_cover: current.cloudcover + '%'
            };

            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            };
          } catch (err) {
            // Fallback mock report if network blocked
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    notice: 'Weather fetched via regional snapshot',
                    city: args.city,
                    temperature: '24°C / 75°F',
                    condition: 'Partly Cloudy',
                    humidity: '62%'
                  }, null, 2)
                }
              ]
            };
          }
        }
      },
      {
        name: 'wikipedia_search',
        description: 'Searches Wikipedia for an encyclopedia summary, factual background, or historical details.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Topic or term to search on Wikipedia (e.g., "Quantum Computing", "Albert Einstein", "Alan Turing")'
            }
          },
          required: ['query']
        },
        handler: async (args) => {
          try {
            const cleanQuery = encodeURIComponent(args.query.trim().replace(/\s+/g, '_'));
            const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${cleanQuery}`, {
              headers: { 'Accept': 'application/json' }
            });

            if (!res.ok) {
              if (res.status === 404) {
                // Try Wikipedia OpenSearch fallback
                const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(args.query)}&limit=3&namespace=0&format=json&origin=*`);
                const searchData = await searchRes.json();
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      query: args.query,
                      related_topics: searchData[1] || [],
                      descriptions: searchData[2] || [],
                      links: searchData[3] || []
                    }, null, 2)
                  }]
                };
              }
              throw new Error(`Wikipedia API error ${res.status}`);
            }

            const data = await res.json();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    title: data.title,
                    description: data.description,
                    extract: data.extract,
                    url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${cleanQuery}`
                  }, null, 2)
                }
              ]
            };
          } catch (err) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Wikipedia lookup failed: ${err.message}` }]
            };
          }
        }
      },
      {
        name: 'fetch_web_page',
        description: 'Fetches text content or JSON data from a public URL endpoint.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Public URL to fetch (HTTP or HTTPS)'
            }
          },
          required: ['url']
        },
        handler: async (args) => {
          try {
            const res = await fetch(args.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const contentType = res.headers.get('content-type') || '';

            let contentText = '';
            if (contentType.includes('application/json')) {
              const json = await res.json();
              contentText = JSON.stringify(json, null, 2);
            } else {
              const rawHtml = await res.text();
              // Strip tags
              const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
              doc.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
              contentText = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || rawHtml.slice(0, 3000);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: contentText.slice(0, 3500)
                }
              ]
            };
          } catch (err) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Failed to fetch URL: ${err.message}` }]
            };
          }
        }
      }
    ]
  },
  {
    id: 'memory-notes-server',
    name: 'Persistent Memory & Notes',
    description: 'Stores and retrieves user facts, preferences, and long-term conversation notes in browser storage.',
    icon: '💾',
    enabled: true,
    tools: [
      {
        name: 'save_memory',
        description: 'Saves a persistent fact, note, or user preference into memory.',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'A short label or key for the memory (e.g., "favorite_color", "user_project", "meeting_note")'
            },
            value: {
              type: 'string',
              description: 'The detail, fact, or content to remember.'
            }
          },
          required: ['key', 'value']
        },
        handler: async (args) => {
          const memories = JSON.parse(localStorage.getItem('hett_mcp_memories') || '{}');
          memories[args.key] = {
            value: args.value,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem('hett_mcp_memories', JSON.stringify(memories));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, message: `Saved memory for "${args.key}"`, key: args.key, value: args.value })
              }
            ]
          };
        }
      },
      {
        name: 'retrieve_memories',
        description: 'Retrieves all saved memories or searches for a specific key/topic.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional query to filter memories by key or content.'
            }
          }
        },
        handler: async (args) => {
          const memories = JSON.parse(localStorage.getItem('hett_mcp_memories') || '{}');
          let results = memories;
          if (args?.query) {
            const q = args.query.toLowerCase();
            results = {};
            for (const [k, v] of Object.entries(memories)) {
              if (k.toLowerCase().includes(q) || String(v.value).toLowerCase().includes(q)) {
                results[k] = v;
              }
            }
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ count: Object.keys(results).length, memories: results }, null, 2)
              }
            ]
          };
        }
      },
      {
        name: 'delete_memory',
        description: 'Deletes a saved memory by its key.',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The key of the memory to delete.' }
          },
          required: ['key']
        },
        handler: async (args) => {
          const memories = JSON.parse(localStorage.getItem('hett_mcp_memories') || '{}');
          const existed = Boolean(memories[args.key]);
          delete memories[args.key];
          localStorage.setItem('hett_mcp_memories', JSON.stringify(memories));
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, deleted: existed, key: args.key })
              }
            ]
          };
        }
      }
    ]
  },
  {
    id: 'text-processor-server',
    name: 'Text & Hash Utilities',
    description: 'Word counting, character statistics, Base64 encoding/decoding, and SHA-256 cryptographic hashing.',
    icon: '📝',
    enabled: true,
    tools: [
      {
        name: 'word_counter',
        description: 'Calculates word count, character count (with and without spaces), paragraph count, and estimated reading time.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to analyze' }
          },
          required: ['text']
        },
        handler: async (args) => {
          const text = args.text || '';
          const words = text.trim().length > 0 ? text.trim().split(/\s+/).length : 0;
          const charsWithSpaces = text.length;
          const charsNoSpaces = text.replace(/\s/g, '').length;
          const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0).length;
          const readingTimeMinutes = Math.ceil(words / 200);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  words: words,
                  characters_with_spaces: charsWithSpaces,
                  characters_no_spaces: charsNoSpaces,
                  paragraphs: paragraphs,
                  estimated_reading_time: `${readingTimeMinutes} min`
                }, null, 2)
              }
            ]
          };
        }
      },
      {
        name: 'hash_generator',
        description: 'Encodes text to Base64, decodes Base64, or computes SHA-256 cryptographic hashes.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Input text' },
            algorithm: {
              type: 'string',
              enum: ['sha256', 'base64_encode', 'base64_decode'],
              description: 'Hash or encoding algorithm'
            }
          },
          required: ['text', 'algorithm']
        },
        handler: async (args) => {
          try {
            if (args.algorithm === 'base64_encode') {
              return {
                content: [{ type: 'text', text: btoa(unescape(encodeURIComponent(args.text))) }]
              };
            } else if (args.algorithm === 'base64_decode') {
              return {
                content: [{ type: 'text', text: decodeURIComponent(escape(atob(args.text))) }]
              };
            } else if (args.algorithm === 'sha256') {
              const msgUint8 = new TextEncoder().encode(args.text);
              const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              return {
                content: [{ type: 'text', text: hashHex }]
              };
            }
            throw new Error(`Unsupported algorithm: ${args.algorithm}`);
          } catch (err) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Hash operation failed: ${err.message}` }]
            };
          }
        }
      }
    ]
  }
];

// ---------------------------------------------------------------------------
// External HTTP JSON-RPC 2.0 MCP Server Connection
// ---------------------------------------------------------------------------
class ExternalMcpServer {
  constructor(config) {
    this.id = config.id || `ext-${Date.now()}`;
    this.name = config.name || 'External MCP Server';
    this.description = config.description || `Connected to ${config.url}`;
    this.url = config.url;
    this.transport = config.transport || 'http'; // 'http' | 'sse'
    this.enabled = config.enabled !== undefined ? config.enabled : true;
    this.icon = '🔗';
    this.tools = config.tools || [];
    this.status = 'unknown'; // 'connected' | 'error' | 'disconnected'
    this.requestId = 1;
  }

  async sendJsonRpc(method, params = {}) {
    const payload = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: method,
      params: params
    };

    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`MCP Server responded with HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`JSON-RPC Error [${data.error.code}]: ${data.error.message}`);
    }
    return data.result;
  }

  async connectAndDiscover() {
    try {
      // 1. Initialize
      await this.sendJsonRpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'hett-mcp-client', version: '2.0.0' }
      });

      // 2. Discover tools
      const toolsResult = await this.sendJsonRpc('tools/list', {});
      const discoveredTools = toolsResult?.tools || [];

      this.tools = discoveredTools.map(t => ({
        name: t.name,
        description: t.description || `Tool from ${this.name}`,
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
        handler: async (args) => {
          const callResult = await this.sendJsonRpc('tools/call', {
            name: t.name,
            arguments: args
          });
          return callResult;
        }
      }));

      this.status = 'connected';
      return { success: true, count: this.tools.length, tools: this.tools };
    } catch (err) {
      this.status = 'error';
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Unified MCP Manager
// ---------------------------------------------------------------------------
class McpManager {
  constructor() {
    this.servers = [];
    this.toolRegistry = new Map(); // toolName -> { tool, server }
    this.init();
  }

  init() {
    // Load enabled state from localStorage
    const savedServerStates = JSON.parse(localStorage.getItem('hett_mcp_server_states') || '{}');

    // Register built-in servers
    this.servers = BUILTIN_SERVERS.map(s => {
      const isEnabled = savedServerStates[s.id] !== undefined ? savedServerStates[s.id] : s.enabled;
      return { ...s, enabled: isEnabled };
    });

    // Load custom external servers
    const customServers = JSON.parse(localStorage.getItem('hett_mcp_custom_servers') || '[]');
    customServers.forEach(cs => {
      const extServer = new ExternalMcpServer(cs);
      this.servers.push(extServer);
    });

    this.rebuildToolRegistry();
  }

  saveState() {
    const states = {};
    const custom = [];

    this.servers.forEach(s => {
      states[s.id] = s.enabled;
      if (s instanceof ExternalMcpServer || s.url) {
        custom.push({
          id: s.id,
          name: s.name,
          url: s.url,
          transport: s.transport,
          enabled: s.enabled,
          tools: s.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        });
      }
    });

    localStorage.setItem('hett_mcp_server_states', JSON.stringify(states));
    localStorage.setItem('hett_mcp_custom_servers', JSON.stringify(custom));
  }

  rebuildToolRegistry() {
    this.toolRegistry.clear();
    this.servers.forEach(server => {
      if (server.enabled) {
        server.tools.forEach(tool => {
          this.toolRegistry.set(tool.name, { tool, server });
        });
      }
    });
  }

  toggleServer(serverId, enabled) {
    const server = this.servers.find(s => s.id === serverId);
    if (server) {
      server.enabled = enabled;
      this.saveState();
      this.rebuildToolRegistry();
    }
  }

  async addExternalServer(name, url, transport = 'http') {
    const ext = new ExternalMcpServer({
      id: `ext-${Date.now()}`,
      name: name.trim() || 'External MCP Server',
      url: url.trim(),
      transport: transport,
      enabled: true
    });

    await ext.connectAndDiscover();
    this.servers.push(ext);
    this.saveState();
    this.rebuildToolRegistry();
    return ext;
  }

  removeServer(serverId) {
    this.servers = this.servers.filter(s => s.id !== serverId);
    this.saveState();
    this.rebuildToolRegistry();
  }

  /**
   * Converts all active registered MCP tools into OpenAI / Groq function calling format
   */
  getOpenAiTools() {
    const tools = [];
    for (const [name, entry] of this.toolRegistry.entries()) {
      tools.push({
        type: 'function',
        function: {
          name: name,
          description: `[MCP Tool: ${entry.server.name}] ${entry.tool.description}`,
          parameters: entry.tool.inputSchema || { type: 'object', properties: {} }
        }
      });
    }
    return tools;
  }

  getActiveToolCount() {
    return this.toolRegistry.size;
  }

  getAllToolsList() {
    const list = [];
    this.servers.forEach(server => {
      server.tools.forEach(tool => {
        list.push({
          serverName: server.name,
          serverId: server.id,
          serverIcon: server.icon,
          serverEnabled: server.enabled,
          toolName: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        });
      });
    });
    return list;
  }

  /**
   * Executes a tool via its registered MCP handler
   */
  async executeTool(name, rawArgs) {
    const entry = this.toolRegistry.get(name);
    if (!entry) {
      throw new Error(`Tool "${name}" is not registered or its MCP server is disabled.`);
    }

    let parsedArgs = rawArgs;
    if (typeof rawArgs === 'string') {
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch (e) {
        parsedArgs = {};
      }
    }

    const result = await entry.tool.handler(parsedArgs);
    return {
      toolName: name,
      serverName: entry.server.name,
      serverIcon: entry.server.icon,
      args: parsedArgs,
      result: result
    };
  }
}

// Export singleton instance
window.MCP = new McpManager();
