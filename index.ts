import * as net from "net";

function newConn(socket: net.Socket): void {
  console.log("new connection", socket.remoteAddress, socket.remotePort);
  socket.on("end", () => {
    // FIN received. The connection will be closed automatically.
    console.log("EOF.");
  });
  socket.on("data", (data: Buffer) => {
    console.log("data:", data.toString());
    socket.write("response from server : Hey client how's there"); // echo back the data.

    // actively closed the connection if the data contains 'q'
    if (data.includes("q")) {
      console.log("closing.");
      socket.end(); // this will send FIN and close the connection.
    }
  });
}

let server = net.createServer();
server.on("connection", newConn);
server.listen({ host: "127.0.0.1", port: 1234 });
server.on("error", (err: Error) => {
  throw err;
});
console.log("server listening on port 1234");
