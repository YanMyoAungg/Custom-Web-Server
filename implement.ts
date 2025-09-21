import { rejects } from "assert";
import * as net from "net";
import { resolve } from "path";

type TCPConn = {
  socket: net.Socket;
  err: null | Error;
  ended: boolean;
  reader: null | {
    resolve: (value: Buffer) => void;
    reject: (reason: Error) => void;
  };
};

type TCPListener = {
  socket: net.Socket;
  err: null | Error;
  ended: boolean;
  acceptor: null | {
    resolve: (value: net.Socket) => void;
    reject: (reason: Error) => void;
  };
};

function soInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket: socket,
    ended: false,
    err: null,
    reader: null,
  };
  socket.on("data", (data: Buffer) => {
    if (conn.reader) {
      const str = data.toString();
      const EOFs: string[] = ["EOF", "eof"];
      if (EOFs.some((buffer) => str.includes(buffer))) {
        socket.write(
          "EOF Received, starting protocol to destroy the client socket. \n "
        );
        socket.destroy();
      } else {
        socket.write("No EOF yet, please continue sending data");
      }
      conn.reader.resolve(data);
      conn.reader = null;
      socket.pause();
      console.log("from data event", data.toString());
    }
  });
  socket.on("end", () => {
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from(""));
      conn.reader = null;
      socket.end();
    }
  });
  socket.on("error", (er: Error) => {
    conn.err = er;
    if (conn.reader) {
      conn.reader.reject(er);
      conn.reader = null;
    }
  });
  return conn;
}

function soRead(conn: TCPConn): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (conn.ended) {
      resolve(Buffer.from("")); //this is kind of sending EOF (End of File) aka no more sending
    }
    if (conn.err) {
      reject(conn.err);
    }
    conn.reader = { resolve: resolve, reject: reject };
    conn.socket.resume();
  });
}
function soWrite(conn: TCPConn, data: Buffer): Promise<string | void> {
  console.assert(data.length > 0);
  return new Promise((res, rej) => {
    if (conn.err) {
      rej(conn.err);
      return conn.err;
    }
    conn.socket.write(data, (err?: Error | null) => {
      if (err) {
        // rej(err);
        return res("Finished writing " + data.length + " bytes");
      }
      res();
    });
  });
}
function soListen(port: number): TCPListener {
  const listener: TCPListener = {
    socket: new net.Socket(),
    err: null,
    ended: false,
    acceptor: null,
  };
  console.log("soListen");
  const server = net.createServer((socket) => {
    console.log(
      "server got connection",
      socket.remoteAddress,
      socket.remotePort
    );
    soAccept(listener, socket);
  });
  server.on("error", (error: Error) => {
    console.log("listener error", error);
    listener.err = error;
    if (listener.acceptor) {
      listener.acceptor.reject(error);
      listener.acceptor = null;
    }
    server.listen(port, () => {
      console.log("server is listening on port:", port);
    });
  });
  server.listen(port, () => {
    console.log("server is listening on port:", port);
  });
  return listener;
}
function soAccept(listener: TCPListener, socket: net.Socket) {
  if (listener.acceptor) {
    listener.acceptor.resolve(socket);
    listener.acceptor = null;
  } else socket.destroy();
}

async function serveClient(socket: net.Socket) {
  const conn = soInit(socket);
  while (true) {
    const data = await soRead(conn);
    if (data.length === 0) {
      console.log("connection closed by client");
      break;
    } else {
      await soWrite(conn, data);
    }
  }
}

async function handleConn(socket: net.Socket): Promise<void> {
  console.log("new connection", socket.remoteAddress, socket.remotePort);
  try {
    await serveClient(socket);
  } catch (error) {
    console.log("exception:", error);
  } finally {
    socket.destroy();
  }
}

async function main() {
  const listener = soListen(1234);
  while (true) {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      listener.acceptor = { resolve: resolve, reject: reject };
    });
    handleConn(socket);
  }
}
main();
