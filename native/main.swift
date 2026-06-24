import Cocoa
import WebKit
import Foundation

class AppDelegate: NSObject, NSApplicationDelegate {
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

        webView = WKWebView(frame: .zero, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")

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
        window.contentView = webView
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

        Thread.sleep(forTimeInterval: 2.0)
        let data = pipe.fileHandleForReading.availableData
        if let output = String(data: data, encoding: .utf8),
           let range = output.range(of: "PORT=") {
            let portStr = output[range.upperBound...].prefix(while: { $0.isNumber })
            backendPort = Int(portStr) ?? 0
        }

        if backendPort > 0 {
            print("Backend started on port \(backendPort)")
        } else {
            print("WARNING: Could not determine backend port")
        }
    }

    private func stopBackend() {
        backendProcess?.terminate()
        backendProcess = nil
    }

    private func findBackendDir() -> String {
        let homePath = NSHomeDirectory()
        let projectBackend = homePath + "/Projects/meeting-minutes-assistant/backend"
        return projectBackend
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
                <p style="color:#444;font-size:12px;margin-top:12px;">cd ~/Projects/meeting-minutes-assistant/backend<br>source .venv/bin/activate && python main.py</p>
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
