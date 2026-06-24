import Cocoa
import WebKit
import Foundation

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var backendProcess: Process?
    var backendPort: Int = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        startBackend()

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        let userScript = WKUserScript(
            source: "window.__BACKEND_PORT__ = \(backendPort);",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(userScript)

        let windowRect = NSRect(x: 0, y: 0, width: 1400, height: 900)
        window = NSWindow(
            contentRect: windowRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = NSColor(red: 0.06, green: 0.06, blue: 0.07, alpha: 1)
        window.minSize = NSSize(width: 1000, height: 700)

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView!.addSubview(webView)

        window.center()
        window.makeKeyAndOrderFront(nil)

        loadUI()
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopBackend()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("Navigation failed: \(error.localizedDescription)")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.loadUI()
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("Provisional navigation failed: \(error.localizedDescription)")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.loadUI()
        }
    }

    private func startBackend() {
        let projectDir = findBackendDir()
        let venvPython = projectDir + "/.venv/bin/python"
        let mainPy = projectDir + "/main.py"

        guard FileManager.default.fileExists(atPath: venvPython) else {
            print("ERROR: Python venv not found at \(venvPython)")
            backendPort = 0
            return
        }

        let pipe = Pipe()
        backendProcess = Process()
        backendProcess?.executableURL = URL(fileURLWithPath: venvPython)
        backendProcess?.arguments = [mainPy]
        backendProcess?.currentDirectoryURL = URL(fileURLWithPath: projectDir)
        backendProcess?.environment = ProcessInfo.processInfo.environment.merging(
            ["PYTHONUNBUFFERED": "1"],
            uniquingKeysWith: { _, new in new }
        )
        backendProcess?.standardOutput = pipe

        do {
            try backendProcess?.run()
        } catch {
            print("ERROR: Failed to start backend: \(error)")
            backendPort = 0
            return
        }

        // 循环等待端口（最多 10 秒）
        let startTime = Date()
        while backendPort == 0 && Date().timeIntervalSince(startTime) < 10.0 {
            Thread.sleep(forTimeInterval: 0.3)
            let data = pipe.fileHandleForReading.availableData
            if let output = String(data: data, encoding: .utf8),
               let range = output.range(of: "PORT=") {
                let portStr = output[range.upperBound...].prefix(while: { $0.isNumber })
                backendPort = Int(portStr) ?? 0
            }
        }

        if backendPort > 0 {
            print("Backend started on port \(backendPort)")
            // 等待服务完全就绪
            waitForBackend()
        } else {
            print("WARNING: Could not determine backend port")
        }
    }

    private func waitForBackend() {
        let url = URL(string: "http://127.0.0.1:\(backendPort)/api/settings")!
        let startTime = Date()
        while Date().timeIntervalSince(startTime) < 5.0 {
            let semaphore = DispatchSemaphore(value: 0)
            var success = false
            let task = URLSession.shared.dataTask(with: url) { data, response, error in
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    success = true
                }
                semaphore.signal()
            }
            task.resume()
            semaphore.wait()
            if success { return }
            Thread.sleep(forTimeInterval: 0.3)
        }
    }

    private func stopBackend() {
        backendProcess?.terminate()
        backendProcess = nil
    }

    private func findBackendDir() -> String {
        let homePath = NSHomeDirectory()
        return homePath + "/Projects/meeting-minutes-assistant/backend"
    }

    private func loadUI() {
        if backendPort > 0 {
            let url = URL(string: "http://127.0.0.1:\(backendPort)/")!
            webView.load(URLRequest(url: url))
        } else {
            let fallbackHTML = """
            <html>
            <body style="background:#0f0f12;color:#fff;font-family:-apple-system;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;">
                <h2 style="font-weight:500;">会议纪要助手</h2>
                <p style="color:#666;font-size:14px;">后端启动失败，请检查 Python 环境</p>
            </div>
            </body>
            </html>
            """
            webView.loadHTMLString(fallbackHTML, baseURL: nil)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
