using System;
using System.IO;
using System.Net;
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

            string relPath = req.Url.LocalPath.TrimStart('/');
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
                res.Headers.Add("Access-Control-Allow-Origin", "*");
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
                byte[] notFound = System.Text.Encoding.UTF8.GetBytes("File Not Found");
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
}
