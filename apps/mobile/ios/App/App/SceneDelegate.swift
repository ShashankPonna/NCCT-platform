import UIKit

// This iOS project was scaffolded by an older Capacitor iOS template
// (AppDelegate-only UIKit lifecycle, no UIScene support). Xcode 27 / iOS 27's
// SDK requires every app to declare a scene delegate — without one, launch
// fails immediately with "Application failed to launch: UIScene life cycle
// is required for apps built with this SDK" (confirmed via a real crash
// report on this exact build, not assumed from documentation). This is the
// standard, minimal scene-lifecycle shim: it just hosts the same
// Main.storyboard (root view controller: CAPBridgeViewController) that the
// AppDelegate-only version rendered directly, so no other app behavior
// changes.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        window.rootViewController = storyboard.instantiateInitialViewController()
        self.window = window
        window.makeKeyAndVisible()
    }

}
