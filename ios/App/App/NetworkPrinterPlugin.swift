import Foundation
import Network
import Capacitor

@objc(NetworkPrinterPlugin)
public class NetworkPrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NetworkPrinterPlugin"
    public let jsName = "NetworkPrinter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "test", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]

    @objc func test(_ call: CAPPluginCall) {
        ejecutar(call, datos: nil)
    }

    @objc func print(_ call: CAPPluginCall) {
        let texto = call.getString("texto") ?? ""
        let copias = min(max(call.getInt("copias") ?? 1, 1), 3)
        guard !texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("El ticket esta vacio.")
            return
        }
        ejecutar(call, datos: construirTrabajo(texto: texto, copias: copias))
    }

    private func ejecutar(_ call: CAPPluginCall, datos: Data?) {
        let ip = (call.getString("ip") ?? "").trimmingCharacters(in: .whitespaces)
        let puertoNumero = call.getInt("puerto") ?? 9100
        guard !ip.isEmpty,
              (1...65535).contains(puertoNumero),
              let puerto = NWEndpoint.Port(rawValue: UInt16(puertoNumero)) else {
            call.reject("La direccion IP o el puerto no son validos.")
            return
        }

        let conexion = NWConnection(host: NWEndpoint.Host(ip), port: puerto, using: .tcp)
        var finalizado = false
        let timeout = DispatchWorkItem {
            guard !finalizado else { return }
            finalizado = true
            conexion.cancel()
            call.reject("La conexion con la impresora agoto el tiempo de espera.")
        }

        conexion.stateUpdateHandler = { estado in
            switch estado {
            case .ready:
                timeout.cancel()
                if let datos = datos {
                    conexion.send(content: datos, completion: .contentProcessed { error in
                        guard !finalizado else { return }
                        finalizado = true
                        conexion.cancel()
                        if let error = error {
                            call.reject("No se pudo imprimir: \(error.localizedDescription)")
                        } else {
                            call.resolve(["mensaje": "Ticket enviado directamente desde el telefono."])
                        }
                    })
                } else {
                    guard !finalizado else { return }
                    finalizado = true
                    conexion.cancel()
                    call.resolve(["mensaje": "Conexion correcta con la impresora."])
                }
            case .failed(let error):
                timeout.cancel()
                guard !finalizado else { return }
                finalizado = true
                conexion.cancel()
                call.reject("No se pudo conectar con la impresora: \(error.localizedDescription)")
            default:
                break
            }
        }

        conexion.start(queue: DispatchQueue.global(qos: .userInitiated))
        DispatchQueue.global().asyncAfter(deadline: .now() + 5, execute: timeout)
    }

    private func construirTrabajo(texto: String, copias: Int) -> Data {
        var resultado = Data()
        let iniciar: [UInt8] = [0x1b, 0x40]
        let cortarStar: [UInt8] = [0x1b, 0x64, 0x02]
        let contenido = (texto + "\n").data(using: .ascii, allowLossyConversion: true) ?? Data()
        for _ in 0..<copias {
            resultado.append(contentsOf: iniciar)
            resultado.append(contenido)
            resultado.append(contentsOf: cortarStar)
        }
        return resultado
    }
}
