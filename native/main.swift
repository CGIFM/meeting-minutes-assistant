import Cocoa
import WebKit
import Foundation
import AVFoundation

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var backendProcess: Process?
    var backendPort: Int = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        startBackend()
        setupMenus()  // 关键：必须建 Edit 菜单，WKWebView 才能响应 Cmd+C/V/A/Z

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        // 允许自动播放音频 + 允许媒体流（麦克风）
        config.mediaTypesRequiringUserActionForPlayback = []
        if #available(macOS 11, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

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
        webView.uiDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView!.addSubview(webView)

        window.center()
        window.makeKeyAndOrderFront(nil)

        // 提前请求麦克风权限（避免 getUserMedia 在 WKWebView 中无响应）
        requestMicrophoneAccess()

        loadUI()
    }

    private func requestMicrophoneAccess() {
        if #available(macOS 10.14, *) {
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                print("Microphone access granted: \(granted)")
            }
        }
    }

    // 标准 Edit 菜单：让 WKWebView 里的 input/textarea 能用 Cmd+C/V/A/Z 等编辑命令
    private func setupMenus() {
        let mainMenu = NSMenu()

        // App 菜单
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 会议纪要助手", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        let hide = appMenu.addItem(withTitle: "隐藏", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        hide.keyEquivalentModifierMask = .command
        let hideOthers = appMenu.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "全部显示", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "退出", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // Edit 菜单（关键）
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // 显示菜单（含刷新页面 Cmd+R）
        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "显示")
        let reloadItem = viewMenu.addItem(withTitle: "重新加载页面", action: #selector(AppDelegate.reloadPage(_:)), keyEquivalent: "r")
        reloadItem.target = self
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        NSApplication.shared.mainMenu = mainMenu
    }

    @objc func reloadPage(_ sender: Any?) {
        webView?.reload()
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

    // MARK: - 文件选择对话框（input type=file）
    func webView(_ webView: WKWebView,
                 runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        // 后续会按 accept 过滤，但前端 accept 已在 web 层生效，这里不强制
        panel.allowedFileTypes = nil

        panel.beginSheetModal(for: window) { response in
            if response == .OK {
                completionHandler(panel.urls)
            } else {
                completionHandler(nil)
            }
        }
    }

    // MARK: - JS alert/confirm/prompt 桥接到原生（防止 alert 锁页面）
    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        // 不弹原生弹窗，避免阻塞；直接放行
        completionHandler()
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        completionHandler(false)
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        completionHandler(defaultText)
    }

    // MARK: - 链接在新窗口打开
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, navigationAction.targetFrame == nil {
            NSWorkspace.shared.open(url)
        }
        return nil
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
