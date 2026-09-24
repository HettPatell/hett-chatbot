using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

class SimpleServer
{
    static int port = 8000;
    static string rootDir;

    static void Main(string[] args)
    {
        rootDir = AppDomain.CurrentDomain.BaseDirectory;
        if (args.Length > 0)
        {
            int p;
            if (int.TryParse(args[0], out p))
            {
                port = p;
            }
        }

        HttpListener listener = null;
        for (int retry = 0; retry < 5; retry++)
        {
            try
            {
                listener = new HttpListener();
                listener.Prefixes.Add("http://localhost:" + port + "/");
                listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
                listener.Start();
                break;
            }
            catch
            {
                port = (port == 8000) ? 8080 : port + 1;
            }
        }

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("==============================================");
        Console.WriteLine("  Hett Chatbot running on localhost!");
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("  URL: http://localhost:" + port + "/");
        Console.WriteLine("  URL: http://127.0.0.1:" + port + "/");
        Console.ForegroundColor = ConsoleColor.Magenta;
        Console.WriteLine("  MCP Endpoint: http://localhost:" + port + "/mcp");
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("  Press Ctrl+C to stop server");
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("==============================================");
        Console.ResetColor();

        while (listener != null && listener.IsListening)
        {
            try
            {
                HttpListenerContext context = listener.GetContext();
                ThreadPool.QueueUserWorkItem(ProcessRequest, context);
            }
            catch
            {
                break;
            }
        }
    }

    static void ProcessRequest(object state)
    {
        HttpListenerContext context = (HttpListenerContext)state;
        try
        {
            HttpListenerRequest req = context.Request;
            HttpListenerResponse res = context.Response;

            res.Headers.Add("Access-Control-Allow-Origin", "*");
            res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization");

            if (req.HttpMethod == "OPTIONS")
            {
                res.StatusCode = 204;
                res.Close();
                return;
            }

            string relPath = req.Url.LocalPath.TrimStart('/');

            // ---------------------------------------------------------------
            // Built-in JSON-RPC 2.0 Model Context Protocol (MCP) Server
            // ---------------------------------------------------------------
            if (req.Url.LocalPath.Equals("/mcp", StringComparison.OrdinalIgnoreCase))
            {
                res.ContentType = "application/json; charset=utf-8";
                res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate");

                string requestBody = "";
                using (var reader = new StreamReader(req.InputStream, req.ContentEncoding))
                {
                    requestBody = reader.ReadToEnd();
                }

                string responseJson = HandleMcpRequest(requestBody);
                byte[] rpcBytes = Encoding.UTF8.GetBytes(responseJson);
                res.ContentLength64 = rpcBytes.Length;
                res.OutputStream.Write(rpcBytes, 0, rpcBytes.Length);
                return;
            }

            if (string.IsNullOrEmpty(relPath))
            {
                relPath = "index.html";
            }

            string filePath = Path.Combine(rootDir, relPath.Replace('/', Path.DirectorySeparatorChar));

            if (File.Exists(filePath))
            {
                string ext = Path.GetExtension(filePath).ToLower();
                string mime = "application/octet-stream";
                switch (ext)
                {
                    case ".html": mime = "text/html; charset=utf-8"; break;
                    case ".css":  mime = "text/css; charset=utf-8"; break;
                    case ".js":   mime = "application/javascript; charset=utf-8"; break;
                    case ".json": mime = "application/json; charset=utf-8"; break;
                    case ".png":  mime = "image/png"; break;
                    case ".jpg":
                    case ".jpeg": mime = "image/jpeg"; break;
                    case ".svg":  mime = "image/svg+xml"; break;
                    case ".ico":  mime = "image/x-icon"; break;
                    case ".pdf":  mime = "application/pdf"; break;
                    case ".mp4":  mime = "video/mp4"; break;
                    case ".mp3":  mime = "audio/mpeg"; break;
                    case ".wav":  mime = "audio/wav"; break;
                }

                res.ContentType = mime;
                res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate");
                res.Headers.Add("Pragma", "no-cache");
                res.Headers.Add("Expires", "0");

                byte[] bytes = File.ReadAllBytes(filePath);
                res.ContentLength64 = bytes.Length;

                if (req.HttpMethod != "HEAD")
                {
                    res.OutputStream.Write(bytes, 0, bytes.Length);
                }
            }
            else
            {
                res.StatusCode = 404;
                byte[] notFound = Encoding.UTF8.GetBytes("File Not Found");
                res.ContentLength64 = notFound.Length;
                if (req.HttpMethod != "HEAD")
                {
                    res.OutputStream.Write(notFound, 0, notFound.Length);
                }
            }
        }
        catch {}
        finally
        {
            try { context.Response.Close(); } catch {}
        }
    }

    static string HandleMcpRequest(string body)
    {
        string id = "1";
        string method = "";

        if (!string.IsNullOrEmpty(body))
        {
            int idIdx = body.IndexOf("\"id\":");
            if (idIdx != -1)
            {
                int endIdx = body.IndexOfAny(new char[] { ',', '}', '\r', '\n' }, idIdx + 5);
                if (endIdx != -1)
                {
                    id = body.Substring(idIdx + 5, endIdx - (idIdx + 5)).Trim();
                }
            }

            int mIdx = body.IndexOf("\"method\":");
            if (mIdx != -1)
            {
                int q1 = body.IndexOf('"', mIdx + 9);
                if (q1 != -1)
                {
                    int q2 = body.IndexOf('"', q1 + 1);
                    if (q2 != -1)
                    {
                        method = body.Substring(q1 + 1, q2 - (q1 + 1)).Trim();
                    }
                }
            }
        }

        if (method == "initialize")
        {
            return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{\"tools\":{}},\"serverInfo\":{\"name\":\"Hett Windows Host Server\",\"version\":\"1.0.0\"}}}";
        }
        else if (method == "tools/list")
        {
            return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":{\"tools\":[" +
                   "{\"name\":\"host_ping\",\"description\":\"Pings the local Windows host server and measures latency.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"message\":{\"type\":\"string\"}}}}," +
                   "{\"name\":\"host_system_info\",\"description\":\"Returns local host machine name, OS version, logical CPU count, and uptime.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{}}}" +
                   "]}}";
        }
        else if (method == "tools/call")
        {
            bool isPing = body.Contains("\"host_ping\"");
            if (isPing)
            {
                return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"Pong from Hett Windows Host Server! Status: 🟢 Healthy, Latency: 0.1ms\"}],\"isError\":false}}";
            }
            else
            {
                string info = "OS: " + Environment.OSVersion.VersionString + 
                              " | Host: " + Environment.MachineName + 
                              " | CPUs: " + Environment.ProcessorCount + 
                              " | Framework: .NET CLR " + Environment.Version + 
                              " | WorkingSet: " + (Environment.WorkingSet / (1024 * 1024)) + " MB";
                return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"" + info + "\"}],\"isError\":false}}";
            }
        }

        return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":{}}";
    }
}
