import Cocoa
import WebKit
import UniformTypeIdentifiers
import Darwin

// A small native macOS shell. All interface resources ship inside the app;
// no web server, external scripts, analytics, or network requests are used.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var dataFolder: URL!
    var dataFile: URL!
    var lockDescriptor: Int32 = -1
    var resources: URL { Bundle.main.resourceURL! }
    let fm = FileManager.default

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            dataFolder = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("Momentum", isDirectory: true)
            try fm.createDirectory(at: dataFolder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            dataFile = dataFolder.appendingPathComponent("workspace.json")
            lockDescriptor = Darwin.open(dataFolder.appendingPathComponent("workspace.lock").path, O_CREAT | O_RDWR, 0o600)
            guard lockDescriptor >= 0, flock(lockDescriptor, LOCK_EX | LOCK_NB) == 0 else {
                throw NSError(domain: "Momentum", code: 1, userInfo: [NSLocalizedDescriptionKey: "Momentum is already running, or its data folder is unavailable. Close the other copy before opening this one."])
            }
        } catch {
            let alert = NSAlert(); alert.messageText = "Momentum couldn’t open its workspace"; alert.informativeText = error.localizedDescription; alert.runModal(); NSApp.terminate(nil); return
        }
        makeMenus()
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "momentum")
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1260, height: 870), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Momentum"
        window.minSize = NSSize(width: 820, height: 640)
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("MomentumMainWindow")
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.loadFileURL(resources.appendingPathComponent("index.html"), allowingReadAccessTo: resources)
    }

    func makeMenus() {
        let menu = NSMenu()
        let applicationItem = NSMenuItem(); menu.addItem(applicationItem)
        let appMenu = NSMenu(); applicationItem.submenu = appMenu
        appMenu.addItem(withTitle: "About Momentum", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Momentum", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Momentum", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let fileItem = NSMenuItem(); menu.addItem(fileItem)
        let file = NSMenu(title: "File"); fileItem.submenu = file
        file.addItem(withTitle: "New Item", action: #selector(newItem), keyEquivalent: "n")
        file.addItem(.separator())
        file.addItem(withTitle: "Export Backup…", action: #selector(exportMenu), keyEquivalent: "e").keyEquivalentModifierMask = [.command, .shift]
        file.addItem(withTitle: "Import Backup…", action: #selector(importBackup), keyEquivalent: "i").keyEquivalentModifierMask = [.command, .shift]
        file.addItem(withTitle: "Show Data Folder", action: #selector(showData), keyEquivalent: "")
        let editItem = NSMenuItem(); menu.addItem(editItem)
        let edit = NSMenu(title: "Edit"); editItem.submenu = edit
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z"); redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let windowItem = NSMenuItem(); menu.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window"); windowItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.zoom(_:)), keyEquivalent: "")
        NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = menu
        // Explicitly target our own actions; standard editing commands use the responder chain.
        for m in [appMenu, file] { for item in m.items {
            if let action = item.action,
               [#selector(about), #selector(newItem), #selector(exportMenu), #selector(importBackup), #selector(showData)].contains(action) {
                item.target = self
            }
        }}
    }

    @objc func about() {
        let alert = NSAlert(); alert.messageText = "Momentum 1.0"; alert.informativeText = "Make room for progress.\n\nAn offline workspace for habits, personal goals, and business projects.\n\nYour data stays on this Mac."; alert.runModal()
    }
    @objc func newItem() { webView.evaluateJavaScript("window.momentumNew?.()", completionHandler: nil) }
    @objc func exportMenu() { webView.evaluateJavaScript("window.momentumExport?.()", completionHandler: nil) }
    @objc func showData() { NSWorkspace.shared.open(dataFolder) }

    func callJS(_ function: String, _ arguments: [Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: arguments, options: [.fragmentsAllowed]), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.\(function)(...\(json))", completionHandler: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.webView === webView,
              let payload = message.body as? [String: Any], let action = payload["action"] as? String else { return }
        switch action {
        case "load":
            do {
                let text = fm.fileExists(atPath: dataFile.path) ? try String(contentsOf: dataFile, encoding: .utf8) : ""
                callJS("momentumReady", [text, NSNull()])
            } catch { callJS("momentumReady", [NSNull(), "Your saved file could not be read: \(error.localizedDescription). It has not been changed."]) }
        case "save":
            let revision = payload["revision"] as? Int ?? 0
            do {
                guard let text = payload["data"] as? String, let bytes = text.data(using: .utf8), bytes.count <= 25 * 1024 * 1024,
                      let obj = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], obj["schemaVersion"] as? Int == 1 else {
                    throw NSError(domain: "Momentum", code: 2, userInfo: [NSLocalizedDescriptionKey: "The workspace could not be saved. Export a backup and check its size (25 MB maximum)."])
                }
                try snapshot()
                try bytes.write(to: dataFile, options: .atomic)
                try? fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: dataFile.path)
                callJS("momentumSaveResult", [revision, NSNull()])
            } catch { callJS("momentumSaveResult", [revision, "Changes are not saved: \(error.localizedDescription). Export a backup before closing."]) }
        case "export": if let text = payload["data"] as? String { exportBackup(text) }
        case "import": importBackup()
        case "showData": showData()
        default: break
        }
    }

    // Save the workspace as it was before the first change of each local day.
    // Keep the newest 30 daily snapshots. Manual exports are never deleted.
    func snapshot() throws {
        guard fm.fileExists(atPath: dataFile.path) else { return }
        let folder = dataFolder.appendingPathComponent("Backups", isDirectory: true)
        try fm.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        let target = folder.appendingPathComponent("Momentum-\(formatter.string(from: Date())).json")
        if !fm.fileExists(atPath: target.path) { try fm.copyItem(at: dataFile, to: target) }
        let backups = try fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).filter { $0.lastPathComponent.hasPrefix("Momentum-") && $0.pathExtension == "json" }.sorted { $0.lastPathComponent > $1.lastPathComponent }
        for old in backups.dropFirst(30) { try? fm.removeItem(at: old) }
    }

    func exportBackup(_ text: String) {
        let panel = NSSavePanel(); panel.allowedContentTypes = [.json]; panel.nameFieldStringValue = "Momentum-backup.json"
        panel.beginSheetModal(for: window) { [weak self] result in
            guard let self = self, result == .OK, let url = panel.url else { return }
            do { try text.write(to: url, atomically: true, encoding: .utf8); self.webView.evaluateJavaScript("toast('Backup exported')", completionHandler: nil) }
            catch { self.showError("Couldn’t export backup", error) }
        }
    }
    @objc func importBackup() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { [weak self] result in
            guard let self = self, result == .OK, let url = panel.url else { return }
            do {
                let attributes = try self.fm.attributesOfItem(atPath: url.path)
                if ((attributes[.size] as? NSNumber)?.intValue ?? 0) > 25 * 1024 * 1024 {
                    throw NSError(domain: "Momentum", code: 3, userInfo: [NSLocalizedDescriptionKey: "Please choose a backup smaller than 25 MB."])
                }
                self.callJS("momentumImport", [try String(contentsOf: url, encoding: .utf8)])
            } catch { self.showError("Couldn’t read backup", error) }
        }
    }
    func showError(_ title: String, _ error: Error) {
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = error.localizedDescription; alert.beginSheetModal(for: window, completionHandler: nil)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, url.isFileURL, url.standardizedFileURL.path.hasPrefix(resources.standardizedFileURL.path + "/") else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { if !flag { window.makeKeyAndOrderFront(nil) }; return true }
    func applicationWillTerminate(_ notification: Notification) { if lockDescriptor >= 0 { flock(lockDescriptor, LOCK_UN); Darwin.close(lockDescriptor) } }
}
@main
struct MomentumApplication {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        application.setActivationPolicy(.regular)
        let delegate = AppDelegate()
        application.delegate = delegate
        // NSApplication's delegate is weak. Keep it alive for the entire run loop.
        withExtendedLifetime(delegate) {
            application.run()
        }
    }
}
