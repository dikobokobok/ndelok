import { io } from 'socket.io-client'

const socket = io({
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export default socket;
