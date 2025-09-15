import * as net from "net";

type TCPConn = {
  // the JS socket object
  socket: net.Socket;
  // from the 'error' event
  err: null | Error;
  // EOF, from the 'end' event
  ended: boolean;
  // the callbacks of the promise of the current read
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

async function main() {
  const listener = soListen(8080);

  while (true) {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      listener.acceptor = { resolve, reject };
    });

    newConn(socket); // handle in background
  }
}

main();

function soInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket: socket,
    err: null,
    ended: false,
    reader: null,
  };
  socket.on("data", (data: Buffer) => {
    // console.log("socket data:", data);
    console.log("socket data:", data.toString());
  });
  socket.on("end", () => {
    // this also fulfills the current read.
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from("")); // EOF
      conn.reader = null;
      conn.socket.end();
    }
  });
  socket.on("error", (err: Error) => {
    // errors are also delivered to the current read.
    conn.err = err;
    console.log("socket error:", conn.err);

    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  });
  return conn;
}
// returns an empty `Buffer` after EOF.
function soRead(conn: TCPConn): Promise<Buffer> {
  console.assert(!conn.reader); // no concurrent calls
  return new Promise((resolve, reject) => {
    // if the connection is not readable, complete the promise now.
    if (conn.err) {
      reject(conn.err);
      return;
    }
    if (conn.ended) {
      resolve(Buffer.from("")); // EOF
      return;
    }

    // save the promise callbacks
    conn.reader = { resolve: resolve, reject: reject };
    // and resume the 'data' event to fulfill the promise later.
    conn.socket.resume();
  });
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);
  return new Promise((resolve, reject) => {
    if (conn.err) {
      reject(conn.err);
      return;
    }

    conn.socket.write(data, (err?: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
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
  const server = net.createServer((socket) => {
    soAccept(listener, socket);
  });
  server.on("error", (err: Error) => {
    listener.err = err;
    console.log("listener error:", listener.err);
    if (listener.acceptor) {
      listener.acceptor.reject(err);
      listener.acceptor = null;
    }
  });
  server.listen(port, () => {
    console.log("listening on port", port);
  });
  return listener;
}

function soAccept(listener: TCPListener, socket: net.Socket): void {
  if (listener.acceptor) {
    listener.acceptor.resolve(socket);
    listener.acceptor = null;
  } else {
    // no pending accept, destroy the socket.
    socket.destroy();
  }
}

async function newConn(socket: net.Socket): Promise<void> {
  console.log("new connection", socket.remoteAddress, socket.remotePort);
  try {
    await serveClient(socket);
  } catch (exc) {
    console.error("exception:", exc);
  } finally {
    socket.destroy();
  }
}

async function serveClient(socket: net.Socket): Promise<void> {
  const conn: TCPConn = soInit(socket);
  while (true) {
    const data = await soRead(conn);
    if (data.length === 0) {
      console.log("connection closed by client");
      break;
    }

    console.log("data", data);
    await soWrite(conn, data);
  }
}
