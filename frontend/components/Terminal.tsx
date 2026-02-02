import React, { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Task, TaskStatus } from '../types';

interface TerminalProps {
  activeTask: Task | null;
  clearKey?: number;
}

const Terminal: React.FC<TerminalProps> = ({ activeTask, clearKey = 0 }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const connectedTaskIdRef = useRef<number | null>(null);
  // Use ref to avoid stale closure in onData callback
  const activeTaskRef = useRef<Task | null>(null);

  // Keep activeTaskRef in sync
  useEffect(() => {
    activeTaskRef.current = activeTask;
  }, [activeTask]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#0f172a',
        foreground: '#f8fafc',
        cursor: '#f8fafc',
        selectionBackground: '#475569',
      },
      fontFamily: 'Fira Code, monospace',
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    term.writeln('\x1b[32mRHCSA Examination Platform Terminal\x1b[0m');
    term.writeln('Select a task and click Start to connect to the container.');
    term.write('\r\n');

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      fitAddon.fit();
      const cols = term.cols;
      const rows = term.rows;
      if (socketRef.current?.connected && connectedTaskIdRef.current != null) {
        socketRef.current.emit('terminal:resize', {
          taskId: connectedTaskIdRef.current,
          cols,
          rows,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    term.onData((data) => {
      const currentTask = activeTaskRef.current;
      if (currentTask?.status !== TaskStatus.RUNNING) {
        term.writeln('\r\n\x1b[31mTerminal inactive. Please START the task container.\x1b[0m');
        return;
      }
      if (socketRef.current?.connected && connectedTaskIdRef.current === currentTask.id) {
        socketRef.current.emit('terminal:input', { taskId: currentTask.id, data });
      } else {
        term.writeln('\r\n\x1b[33mConnecting...\x1b[0m');
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  // Connect/disconnect Socket.IO when activeTask changes and is RUNNING
  useEffect(() => {
    const taskId = activeTask?.id ?? null;
    const running = activeTask?.status === TaskStatus.RUNNING;

    if (!running || taskId == null) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      connectedTaskIdRef.current = null;
      return;
    }

    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    connectedTaskIdRef.current = taskId;

    socket.on('connect', () => {
      socket.emit('terminal:connect', { taskId });
    });

    socket.on('terminal:output', (payload: { taskId: number; data: string }) => {
      if (payload.taskId === taskId && xtermRef.current) {
        xtermRef.current.write(payload.data);
      }
    });

    socket.on('terminal:exit', (payload: { taskId: number; code: number }) => {
      if (payload.taskId === taskId && xtermRef.current) {
        xtermRef.current.writeln(`\r\n\x1b[33m[Process exited with code ${payload.code}]\x1b[0m`);
        xtermRef.current.write('[root@node1 ~]# ');
      }
    });

    socket.on('terminal:error', (payload: { taskId: number; message: string }) => {
      if (payload.taskId === taskId && xtermRef.current) {
        xtermRef.current.writeln(`\r\n\x1b[31m[Error] ${payload.message}\x1b[0m`);
        xtermRef.current.write('[root@node1 ~]# ');
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      connectedTaskIdRef.current = null;
    };
  }, [activeTask?.id, activeTask?.status]);

  // Clear terminal when start/stop/reset is clicked
  useEffect(() => {
    if (clearKey > 0 && xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.writeln('\x1b[32mRHCSA Examination Platform Terminal\x1b[0m');
      xtermRef.current.writeln('Select a task and click Start to connect to the container.');
      xtermRef.current.write('\r\n');
    }
  }, [clearKey]);

  // Resize notification when activeTask becomes running
  useEffect(() => {
    if (activeTask?.status === TaskStatus.RUNNING && xtermRef.current && fitAddonRef.current) {
      fitAddonRef.current.fit();
      const cols = xtermRef.current.cols;
      const rows = xtermRef.current.rows;
      if (socketRef.current?.connected && connectedTaskIdRef.current === activeTask.id) {
        socketRef.current.emit('terminal:resize', { taskId: activeTask.id, cols, rows });
      }
    }
  }, [activeTask?.id, activeTask?.status]);

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden rounded-b-lg border-x border-b border-slate-700 shadow-2xl">
      <div className="bg-slate-800 px-4 py-1 flex items-center gap-2 border-b border-slate-700">
        <div className="w-3 h-3 rounded-full bg-red-500"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="text-xs text-slate-400 font-mono ml-2">root@node1:~</span>
      </div>
      <div ref={terminalRef} className="flex-1 w-full h-full p-2" />
    </div>
  );
};

export default Terminal;
