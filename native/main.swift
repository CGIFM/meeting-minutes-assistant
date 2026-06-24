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
        let projectDir = findProjectDir()

        let venvPython = projectDir + "/backend/.venv/bin/python"
        let mainPy = projectDir + "/backend/main.py"

        guard FileManager.default.fileExists(atPath: venvPython) else {
            print("ERROR: Python venv not found at \(venvPython)")
            print("Please run: cd backend && source .venv/bin/activate")
            backendPort = 58886
            return
        }

        let pipe = Pipe()
        backendProcess = Process()
        backendProcess?.executableURL = URL(fileURLWithPath: venvPython)
        backendProcess?.arguments = [mainPy]
        backendProcess?.currentDirectoryURL = URL(fileURLWithPath: projectDir + "/backend")
        backendProcess?.environment = ProcessInfo.processInfo.environment.merging(
            ["PYTHONUNBUFFERED": "1"],
            uniquingKeysWith: { _, new in new }
        )
        backendProcess?.standardOutput = pipe

        do {
            try backendProcess?.run()
        } catch {
            print("ERROR: Failed to start backend: \(error)")
            backendPort = 58886
            return
        }

        let data = pipe.fileHandleForReading.availableData
        if let output = String(data: data, encoding: .utf8),
           let range = output.range(of: "PORT=") {
            let portStr = output[range.upperBound...].prefix(while: { $0.isNumber })
            backendPort = Int(portStr) ?? 58886
        } else {
            Thread.sleep(forTimeInterval: 2.0)
            let data2 = pipe.fileHandleForReading.availableData
            if let output2 = String(data: data2, encoding: .utf8),
               let range2 = output2.range(of: "PORT=") {
                let portStr2 = output2[range2.upperBound...].prefix(while: { $0.isNumber })
                backendPort = Int(portStr2) ?? 58886
            } else {
                backendPort = 58886
            }
        }

        print("Backend started on port \(backendPort)")
    }

    private func stopBackend() {
        backendProcess?.terminate()
        backendProcess = nil
    }

    private func findProjectDir() -> String {
        let execPath = Bundle.main.executablePath ?? ""
        let execDir = (execPath as NSString).deletingLastPathComponent

        // 开发模式：从项目目录直接运行
        let devPath = (execDir as NSString).deletingLastPathComponent
        if FileManager.default.fileExists(atPath: devPath + "/backend/main.py") {
            return devPath
        }

        // app bundle 模式
        let resourcesPath = Bundle.main.resourcePath ?? ""
        if FileManager.default.fileExists(atPath: resourcesPath + "/backend/main.py") {
            return resourcesPath
        }

        // fallback: 当前工作目录
        let cwd = FileManager.default.currentDirectoryPath
        if FileManager.default.fileExists(atPath: cwd + "/backend/main.py") {
            return cwd
        }

        return cwd
    }

    private func loadUI() {
        let projectDir = findProjectDir()
        let htmlPath = projectDir + "/dist/index.html"

        if FileManager.default.fileExists(atPath: htmlPath) {
            let url = URL(fileURLWithPath: htmlPath)
            webView.loadFileURL(url, allowingReadAccessTo: URL(fileURLWithPath: projectDir + "/dist"))
        } else {
            let fallbackHTML = """
            <html>
            <body style="background:#0f0f12;color:#fff;font-family:-apple-system;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;">
                <h2>会议纪要助手</h2>
                <p style="color:#666;">前端未构建，请先运行: npm run build</p>
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
