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
    if (conn.reader) {
      conn.reader.resolve(data);
      conn.reader = null;
      socket.pause();
      console.log("socket data:", data.toString());
      console.log("socket is paused");
    }
  });
  socket.on("end", () => {
    // this also fulfills the current read.
    console.log("socket end event fired");
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
    console.log("soRead: resuming socket");
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
  console.log("fuck u");

  const server = net.createServer((socket) => {
    console.log(
      "server got connection",
      socket.remoteAddress,
      socket.remotePort
    );

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

type DynBuf = {
  data: Buffer;
  length: number;
  start: number;
};

async function serveClient(socket: net.Socket): Promise<void> {
  const conn: TCPConn = soInit(socket);
  const buf: DynBuf = { data: Buffer.alloc(0), length: 0, start: 0 };
  while (true) {
    const msg: null | Buffer = cutMessage(buf);
    if (!msg) {
      const data: Buffer = await soRead(conn);
      bufPush(buf, data);
      if (data.length === 0) {
        console.log("connection closed by client");
        break;
      }
      console.log("data", data.toString());
      await soWrite(conn, data);
      continue;
    }
    // process the message and send the response
    if (msg.equals(Buffer.from("quit\n"))) {
      console.log("client quit");

      await soWrite(conn, Buffer.from("Bye.\n"));
      socket.destroy();
      return;
    } else {
      const reply = Buffer.concat([Buffer.from(`Echo: ${msg.toString()}`)]);
      await soWrite(conn, reply);
    }
  }
}

function bufPush(buf: DynBuf, data: Buffer): void {
  console.log("buf start", buf.start);
  console.log("buf length", buf.length);

  const newLen = buf.length + buf.start + data.length;
  if (buf.data.length < newLen) {
    const newCap = Math.max(buf.data.length * 2, newLen);
    const newBuf = Buffer.alloc(newCap);
    buf.data.copy(newBuf, 0, buf.start, buf.start + buf.length);
    buf.data = newBuf;
    buf.start = 0;
  }
  data.copy(buf.data, buf.start + buf.length);
  buf.length += data.length;
}

function cutMessage(buf: DynBuf): null | Buffer {
  // messages are separated by '\n'
  // In every message endings contains line feed(\r) and carriage return(\n)'\r\n'
  const idx = buf.data
    .subarray(buf.start, buf.length + buf.start)
    .indexOf("\n");
  console.log("got executed");

  if (idx < 0) {
    return null; // meaning not completed
  }
  // make a copy of the message and move the remaining data to the front
  const msg = Buffer.from(buf.data.subarray(0, idx + 1));
  console.log(msg.toString());

  bufPop(buf, idx + 1);
  return msg;
}

// No longer pop everything, just move the start forward
function bufPop(buf: DynBuf, len: number): void {
  buf.start += len;
  buf.length -= len;

  // Now only pop when necessary such as when the buffer is nearly full
  if (buf.start * 2 > buf.data.length) {
    buf.data.copyWithin(0, buf.start, buf.length + buf.start);
    buf.start = 0;
  }
  buf.data.copyWithin(0, len, buf.length);
  console.log("buf data remaining:", buf.data.toString("utf-8", 0, buf.length));
}
