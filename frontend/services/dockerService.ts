import { DockerStatus, Task, CheckResult } from '../types';

const API = ''; // same origin when served from Flask

export const getDockerStatus = async (): Promise<DockerStatus> => {
  const res = await fetch(`${API}/api/docker/status`);
  const data = await res.json();
  return data as DockerStatus;
};

export const getTasks = async (): Promise<Task[]> => {
  const res = await fetch(`${API}/api/tasks`);
  const data = await res.json();
  return data as Task[];
};

export const startContainer = async (taskId: number): Promise<boolean> => {
  const res = await fetch(`${API}/api/task/${taskId}/start`, { method: 'POST' });
  const data = await res.json();
  return res.ok && data?.ok === true;
};

export const stopContainer = async (taskId: number): Promise<boolean> => {
  const res = await fetch(`${API}/api/task/${taskId}/stop`, { method: 'POST' });
  const data = await res.json();
  return res.ok && data?.ok === true;
};

export const resetContainer = async (taskId: number): Promise<boolean> => {
  const res = await fetch(`${API}/api/task/${taskId}/reset`, { method: 'POST' });
  const data = await res.json();
  return res.ok && data?.ok === true;
};

export const checkTask = async (taskId: number): Promise<CheckResult> => {
  const res = await fetch(`${API}/api/task/${taskId}/check`, { method: 'POST' });
  const data = await res.json();
  return data as CheckResult;
};
