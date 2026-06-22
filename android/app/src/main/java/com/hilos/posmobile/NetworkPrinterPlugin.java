package com.hilos.posmobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NetworkPrinter")
public class NetworkPrinterPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void test(PluginCall call) {
        executor.execute(() -> {
            try (Socket socket = conectar(call)) {
                JSObject resultado = new JSObject();
                resultado.put("mensaje", "Conexion correcta con la impresora.");
                call.resolve(resultado);
            } catch (Exception error) {
                call.reject(mensajeError(error), error);
            }
        });
    }

    @PluginMethod
    public void print(PluginCall call) {
        executor.execute(() -> {
            try (Socket socket = conectar(call)) {
                String texto = call.getString("texto", "");
                int copias = Math.min(Math.max(call.getInt("copias", 1), 1), 3);
                if (texto.trim().isEmpty()) throw new Exception("El ticket esta vacio.");

                OutputStream salida = socket.getOutputStream();
                salida.write(construirTrabajo(texto, copias));
                salida.flush();

                JSObject resultado = new JSObject();
                resultado.put("mensaje", "Ticket enviado directamente desde el telefono.");
                call.resolve(resultado);
            } catch (Exception error) {
                call.reject(mensajeError(error), error);
            }
        });
    }

    private Socket conectar(PluginCall call) throws Exception {
        String ip = call.getString("ip", "").trim();
        int puerto = call.getInt("puerto", 9100);
        if (!ip.matches("^(?:\\d{1,3}\\.){3}\\d{1,3}$")) {
            throw new Exception("Escribe una direccion IPv4 valida.");
        }
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(ip, puerto), 5000);
        socket.setSoTimeout(5000);
        return socket;
    }

    private byte[] construirTrabajo(String texto, int copias) throws Exception {
        ByteArrayOutputStream datos = new ByteArrayOutputStream();
        byte[] iniciar = new byte[] { 0x1b, 0x40 };
        byte[] cortarStar = new byte[] { 0x1b, 0x64, 0x02 };
        byte[] contenido = (texto + "\n").getBytes(StandardCharsets.US_ASCII);
        for (int i = 0; i < copias; i++) {
            datos.write(iniciar);
            datos.write(contenido);
            datos.write(cortarStar);
        }
        return datos.toByteArray();
    }

    private String mensajeError(Exception error) {
        String detalle = error.getMessage() == null ? "Error desconocido" : error.getMessage();
        return "No se pudo conectar con la impresora: " + detalle;
    }
}
