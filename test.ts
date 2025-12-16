import * as net from "net";

const server = net.createServer((socket) => {
  console.log("Client connected");

  const soWrite = (step: number) => {
    if (step === 1) {
      return socket.write("X first time".repeat(1000));
    } else {
      return socket.write("X second time".repeat(1000));
    }
  };
  // Try to flood the buffer with a LOT of data
  let canWrite = true;
  for (let i = 0; i < 1e5; i++) {
    canWrite = soWrite(1); // 1000 bytes each time

    if (!canWrite) {
      console.log("Buffer full, waiting for drain...");
      break;
    }
  }
  // Listen for 'drain' to resume writing
  socket.on("drain", () => {
    console.log("Buffer drained, writing more...");
    // for (let i = 0; i < 1e5; i++) {
    //   const ok = soWrite(2);
    //   if (!ok) {
    //     console.log("Buffer full again, pausing...");
    //     break;
    //   }
    // }
  });
});

server.listen(8081, () => {
  console.log("Listening on port 8081");
});
