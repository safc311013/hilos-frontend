import Capacitor

class HilosBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NetworkPrinterPlugin())
    }
}
