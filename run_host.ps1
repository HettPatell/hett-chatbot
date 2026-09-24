param([int]$port = 8000)

$dir = $PSScriptRoot
if (-not $dir) { $dir = (Get-Location).Path }

$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$port/")
$http.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $http.Start()
} catch {
    $port = 8080
    $http = New-Object System.Net.HttpListener
    $http.Prefixes.Add("http://localhost:$port/")
    $http.Prefixes.Add("http://127.0.0.1:$port/")
    $http.Start()
}

Write-Host "Hett Web Host running on port $port" -ForegroundColor Green

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".pdf"  = "application/pdf"
    ".mp4"  = "video/mp4"
    ".mp3"  = "audio/mpeg"
    ".wav"  = "audio/wav"
}

try {
    while ($http.IsListening) {
        $ctx = $http.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $res.Headers.Add("Access-Control-Allow-Origin", "*")
        $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
        $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")

        if ($req.HttpMethod -eq "OPTIONS") {
            $res.StatusCode = 204
            $ctx.Response.Close()
            continue
        }

        # Model Context Protocol Endpoint
        if ($req.Url.LocalPath -eq "/mcp") {
            $res.ContentType = "application/json; charset=utf-8"
            $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
            $body = $reader.ReadToEnd()
            $reader.Close()

            $jsonObj = $null
            try { $jsonObj = ConvertFrom-Json $body } catch {}
            $reqId = if ($jsonObj -and $jsonObj.id) { $jsonObj.id } else { 1 }
            $method = if ($jsonObj -and $jsonObj.method) { $jsonObj.method } else { "" }

            $reply = @{ jsonrpc = "2.0"; id = $reqId; result = @{} }

            if ($method -eq "initialize") {
                $reply.result = @{
                    protocolVersion = "2024-11-05"
                    capabilities = @{ tools = @{} }
                    serverInfo = @{ name = "Hett Host Local MCP"; version = "1.0.0" }
                }
            } elseif ($method -eq "tools/list") {
                $reply.result = @{
                    tools = @(
                        @{
                            name = "host_ping"
                            description = "Pings the local Windows host server and checks response latency."
                            inputSchema = @{ type = "object"; properties = @{} }
                        },
                        @{
                            name = "host_system_info"
                            description = "Returns host machine name, OS version, logical CPU cores, and memory usage."
                            inputSchema = @{ type = "object"; properties = @{} }
                        }
                    )
                }
            } elseif ($method -eq "tools/call") {
                $toolName = if ($jsonObj.params) { $jsonObj.params.name } else { "" }
                if ($toolName -eq "host_ping") {
                    $reply.result = @{
                        content = @(@{ type = "text"; text = "Pong from local host! Latency: <1ms, Status: 🟢 Online" })
                        isError = $false
                    }
                } else {
                    $os = [System.Environment]::OSVersion.VersionString
                    $machine = [System.Environment]::MachineName
                    $cpus = [System.Environment]::ProcessorCount
                    $mem = [Math]::Round(([System.Environment]::WorkingSet / 1MB), 1)
                    $reply.result = @{
                        content = @(@{ type = "text"; text = "Host: $machine | OS: $os | CPUs: $cpus cores | WorkingSet: ${mem}MB" })
                        isError = $false
                    }
                }
            }

            $bytes = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $reply -Depth 10 -Compress))
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $ctx.Response.Close()
            continue
        }

        # Static File Serving
        $subPath = $req.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($subPath)) { $subPath = "index.html" }
        $targetFile = Join-Path $dir $subPath

        if (Test-Path $targetFile -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($targetFile).ToLower()
            $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
            $res.ContentType = $mime
            
            $fileData = [System.IO.File]::ReadAllBytes($targetFile)
            $res.ContentLength64 = $fileData.Length

            if ($req.HttpMethod -ne "HEAD") {
                $res.OutputStream.Write($fileData, 0, $fileData.Length)
            }
        } else {
            $res.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("File Not Found")
            $res.ContentLength64 = $msg.Length
            if ($req.HttpMethod -ne "HEAD") {
                $res.OutputStream.Write($msg, 0, $msg.Length)
            }
        }
        $ctx.Response.Close()
    }
} finally {
    try { $http.Stop(); $http.Close() } catch {}
}
