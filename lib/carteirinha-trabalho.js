// Monta o GIF da carteirinha fora da linha principal do bot (ver carteirinha.js)
import { parentPort, workerData } from 'node:worker_threads';
import { animar } from './carteirinha.js';

parentPort.postMessage(await animar(workerData.d, { limite: workerData.limite }));
