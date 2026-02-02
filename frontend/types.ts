
export enum TaskStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  STOPPED = 'stopped',
  STARTING = 'starting'
}

export enum NodeGroup {
  NODE1 = 'NODE1',
  NODE2 = 'NODE2'
}

export interface CheckDetail {
  name: string;
  passed: boolean;
  message: string;
}

export interface CheckResult {
  status: 'PASS' | 'FAIL' | 'ERROR';
  summary: string;
  details: CheckDetail[];
  timestamp: string;
}

export interface Task {
  id: number;
  node: NodeGroup;
  title: string;
  instructions: string;
  status: TaskStatus;
  lastCheck: CheckResult | null;
}

export interface PanelState {
  tasks: boolean;
  instructions: boolean;
  terminal: boolean;
  results: boolean;
}

export interface DockerStatus {
  available: boolean;
  version?: string;
  error?: string;
}
