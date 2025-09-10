// client.ts
import * as net from "net";

const client = net.createConnection({ port: 12334 }, () => {
  //   console.log("Connected to server!");
  //   client.write("Hello server 👋");
});

client.on("data", (data) => {
  console.log("Server says:", data.toString());
  client.end(); // close after receiving echo
});

client.on("end", () => {
  console.log("Disconnected from server.");
});
client.on("error", (error) => {
  console.log(error.message);

  client.connect({ port: 1234 }, () => {
    console.log("Reconnected to server!");
    client.write("Hello again, server 👋 \n");
    client.write("Let's close the connection with q");
  });
});
