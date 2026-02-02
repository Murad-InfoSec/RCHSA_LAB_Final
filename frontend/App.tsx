
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Task, 
  TaskStatus, 
  PanelState, 
  DockerStatus, 
  NodeGroup,
  CheckResult
} from './types';
import { 
  getDockerStatus, 
  getTasks,
  startContainer, 
  stopContainer, 
  resetContainer, 
  checkTask 
} from './services/dockerService';
import { 
  TerminalIcon, 
  ListIcon, 
  BookOpenIcon, 
  CheckCircleIcon,
  PlayIcon,
  SquareIcon,
  RotateCcwIcon,
  RedHatIcon,
  AlertTriangleIcon
} from './components/Icon';
import Terminal from './components/Terminal';

const App: React.FC = () => {
  // State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(1);
  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [terminalClearKey, setTerminalClearKey] = useState(0);

  const [panels, setPanels] = useState<PanelState>(() => {
    const saved = localStorage.getItem('ui.panels');
    return saved ? JSON.parse(saved) : {
      tasks: true,
      instructions: true,
      terminal: true,
      results: true
    };
  });

  // Derived state
  const activeTask = tasks.find(t => t.id === activeTaskId) || null;

  // Effects
  useEffect(() => {
    const init = async () => {
      try {
        const [status, taskList] = await Promise.all([getDockerStatus(), getTasks()]);
        setDockerStatus(status);
        setTasks(taskList);
        if (taskList.length > 0 && !activeTaskId) setActiveTaskId(taskList[0].id);
      } catch (_) {
        setDockerStatus({ available: false, error: 'Failed to load' });
        setTasks([]);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    localStorage.setItem('ui.panels', JSON.stringify(panels));
  }, [panels]);

  // Handlers
  const togglePanel = (panel: keyof PanelState) => {
    setPanels(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const handleTaskAction = async (taskId: number, action: 'start' | 'stop' | 'reset' | 'check') => {
    if (!dockerStatus?.available) return;

    if (action === 'start' || action === 'stop' || action === 'reset') {
      setTerminalClearKey((k) => k + 1);
    }

    // Update status to loading state
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, status: TaskStatus.STARTING } : t
    ));

    let success = false;
    let newStatus = TaskStatus.IDLE;
    let checkResult: CheckResult | null = null;

    try {
      switch (action) {
        case 'start':
          success = await startContainer(taskId);
          newStatus = success ? TaskStatus.RUNNING : TaskStatus.IDLE;
          break;
        case 'stop':
          success = await stopContainer(taskId);
          newStatus = TaskStatus.STOPPED;
          break;
        case 'reset':
          success = await resetContainer(taskId);
          newStatus = success ? TaskStatus.RUNNING : TaskStatus.IDLE;
          break;
        case 'check':
          checkResult = await checkTask(taskId);
          newStatus = TaskStatus.RUNNING; // Keep running after check
          success = true;
          break;
      }
    } catch (e) {
      console.error(e);
      success = false;
    }

    setTasks(prev => prev.map(t => 
      t.id === taskId ? { 
        ...t, 
        status: newStatus, 
        lastCheck: checkResult || t.lastCheck 
      } : t
    ));
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 flex-col gap-4">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-indigo-300 font-medium animate-pulse">Initializing RHCSA Examination Platform...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-0.5 rounded-lg">
            <RedHatIcon className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            RHCSA <span className="text-red-500">Examination Platform</span>
          </h1>
          <div className="flex items-center gap-2 ml-4 px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold uppercase tracking-wider">
            <div className={`w-1.5 h-1.5 rounded-full ${dockerStatus?.available ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            {dockerStatus?.available ? `Docker Active v${dockerStatus.version}` : 'Docker Offline'}
          </div>
        </div>

        {/* Global Panel Toggle Bar */}
        <div className="flex items-center bg-slate-800/50 rounded-lg p-1 border border-slate-700 shadow-sm">
          <ToggleButton 
            active={panels.tasks} 
            onClick={() => togglePanel('tasks')} 
            icon={<ListIcon className="w-4 h-4" />} 
            label="Tasks"
          />
          <ToggleButton 
            active={panels.instructions} 
            onClick={() => togglePanel('instructions')} 
            icon={<BookOpenIcon className="w-4 h-4" />} 
            label="Instructions"
          />
          <ToggleButton 
            active={panels.terminal} 
            onClick={() => togglePanel('terminal')} 
            icon={<TerminalIcon className="w-4 h-4" />} 
            label="Terminal"
          />
          <ToggleButton 
            active={panels.results} 
            onClick={() => togglePanel('results')} 
            icon={<CheckCircleIcon className="w-4 h-4" />} 
            label="Results"
          />
        </div>
      </header>

      {/* Main Content Area */}
      {!dockerStatus?.available ? (
        <div className="flex-1 flex items-center justify-center p-8 bg-slate-900">
           <div className="max-w-md w-full p-8 bg-slate-800 rounded-2xl border border-red-500/20 shadow-2xl flex flex-col items-center text-center">
              <AlertTriangleIcon className="w-16 h-16 text-red-500 mb-6" />
              <h2 className="text-2xl font-bold mb-4">Docker Daemon Unavailable</h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                We couldn't connect to the Docker engine. Please ensure Docker is running and your current user has permissions to access the Docker socket.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors w-full"
              >
                Retry Connection
              </button>
           </div>
        </div>
      ) : (
        <main className="flex-1 overflow-hidden grid grid-cols-12 gap-0 p-0">
          {/* Tasks Panel */}
          {panels.tasks && (
            <section className="col-span-12 md:col-span-3 border-r border-slate-800 bg-slate-900/30 flex flex-col h-full overflow-hidden transition-all duration-300">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/80 backdrop-blur">
                <h3 className="font-bold flex items-center gap-2">
                  <ListIcon className="w-4 h-4 text-red-400" />
                  Task Registry
                </h3>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">{tasks.length} Total</span>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                <div className="p-2 flex flex-col gap-1">
                  <NodeGroupHeader group={NodeGroup.NODE1} count={14} />
                  {tasks.filter(t => t.node === NodeGroup.NODE1).map(task => (
                    <TaskItem 
                      key={task.id} 
                      task={task} 
                      active={activeTaskId === task.id} 
                      onClick={() => setActiveTaskId(task.id)} 
                    />
                  ))}
                  <NodeGroupHeader group={NodeGroup.NODE2} count={6} />
                  {tasks.filter(t => t.node === NodeGroup.NODE2).map(task => (
                    <TaskItem 
                      key={task.id} 
                      task={task} 
                      active={activeTaskId === task.id} 
                      onClick={() => setActiveTaskId(task.id)} 
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Core Workflow Area */}
          <div className={`col-span-12 flex flex-col h-full overflow-hidden ${panels.tasks ? 'md:col-span-9' : 'md:col-span-12'}`}>
            <div className="flex-1 grid grid-rows-2 gap-0 overflow-hidden">
              
              {/* Instructions Panel */}
              {panels.instructions && (
                <section className="row-span-1 border-b border-slate-800 p-6 overflow-y-auto bg-slate-900 flex flex-col">
                  {activeTask ? (
                    <div className="animate-panel-enter-active">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold font-mono">
                            TASK {activeTask.id}
                          </span>
                          <h2 className="text-2xl font-bold">{activeTask.title}</h2>
                        </div>
                        <div className="flex items-center gap-2">
                           <ActionButton 
                              label="Start" 
                              icon={<PlayIcon className="w-4 h-4" />} 
                              onClick={() => handleTaskAction(activeTask.id, 'start')} 
                              disabled={activeTask.status === TaskStatus.RUNNING || activeTask.status === TaskStatus.STARTING}
                              variant="green"
                           />
                           <ActionButton 
                              label="Stop" 
                              icon={<SquareIcon className="w-4 h-4" />} 
                              onClick={() => handleTaskAction(activeTask.id, 'stop')} 
                              disabled={activeTask.status !== TaskStatus.RUNNING}
                              variant="red"
                           />
                           <ActionButton 
                              label="Reset" 
                              icon={<RotateCcwIcon className="w-4 h-4" />} 
                              onClick={() => handleTaskAction(activeTask.id, 'reset')} 
                              variant="blue"
                           />
                        </div>
                      </div>
                      <div className="prose prose-invert max-w-none">
                        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 leading-relaxed text-slate-300">
                          {activeTask.instructions}
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end">
                        <button 
                          onClick={() => handleTaskAction(activeTask.id, 'check')}
                          disabled={activeTask.status !== TaskStatus.RUNNING}
                          className="px-8 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-600/20 transition-all hover:-translate-y-0.5"
                        >
                          <CheckCircleIcon className="w-5 h-5" />
                          Verify Task Completion
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 italic">
                      Select a task from the list to begin
                    </div>
                  )}
                </section>
              )}

              {/* Middle Section: Terminal and Results */}
              <div className={`flex flex-1 overflow-hidden h-full ${!panels.instructions ? 'row-span-2' : 'row-span-1'}`}>
                {/* Terminal Panel */}
                {panels.terminal && (
                  <section className={`h-full p-4 flex flex-col ${panels.results ? 'w-2/3' : 'w-full'} border-r border-slate-800 bg-slate-900/50`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <TerminalIcon className="w-3 h-3" />
                        Live Terminal
                      </h4>
                      {activeTask?.status === TaskStatus.RUNNING && (
                        <div className="flex items-center gap-1.5">
                           <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                           <span className="text-[10px] text-green-500 font-bold uppercase">Online</span>
                        </div>
                      )}
                    </div>
                    <Terminal activeTask={activeTask} clearKey={terminalClearKey} />
                  </section>
                )}

                {/* Results Panel */}
                {panels.results && (
                  <section className={`h-full flex flex-col bg-slate-900/30 overflow-y-auto scrollbar-thin ${panels.terminal ? 'w-1/3' : 'w-full'}`}>
                    <div className="p-4 border-b border-slate-800 sticky top-0 bg-slate-900/80 backdrop-blur z-10 flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <CheckCircleIcon className="w-3 h-3" />
                        Validation Results
                      </h4>
                    </div>
                    <div className="p-4">
                      {activeTask?.lastCheck ? (
                        <div className="space-y-4 animate-panel-enter-active">
                          <div className={`p-4 rounded-xl border flex flex-col gap-1 ${
                            activeTask.lastCheck.status === 'PASS' 
                              ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                              : 'bg-red-500/10 border-red-500/20 text-red-400'
                          }`}>
                            <div className="flex items-center justify-between font-bold">
                              <span>Result: {activeTask.lastCheck.status}</span>
                              <span className="text-[10px] opacity-70">
                                {new Date(activeTask.lastCheck.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-sm opacity-90">{activeTask.lastCheck.summary}</p>
                          </div>
                          <div className="space-y-2">
                            {activeTask.lastCheck.details.map((detail, idx) => (
                              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800 border border-slate-700/50">
                                <div className={`mt-0.5 p-0.5 rounded-full ${detail.passed ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                  {detail.passed ? (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                  ) : (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="text-xs font-bold text-slate-200">{detail.name}</div>
                                  <div className="text-[10px] text-slate-500 leading-tight">{detail.message}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-600 gap-2">
                          <CheckCircleIcon className="w-8 h-8 opacity-20" />
                          <p className="text-xs italic">No validation performed yet.</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
};

// Sub-components
interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all group ${
      active 
        ? 'bg-red-600/20 text-red-400 border border-red-500/20 shadow-sm' 
        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 border border-transparent'
    }`}
  >
    <div className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
      {icon}
    </div>
    <span className="hidden sm:inline">{label}</span>
  </button>
);

const NodeGroupHeader: React.FC<{ group: string, count: number }> = ({ group, count }) => (
  <div className="px-3 py-2 mt-4 mb-1 flex items-center justify-between">
    <span className="text-[10px] font-black tracking-widest text-slate-600 uppercase">{group}</span>
    <span className="w-4 h-4 flex items-center justify-center bg-slate-800 text-[9px] font-bold text-slate-500 rounded-full">{count}</span>
  </div>
);

const TaskItem: React.FC<{ task: Task, active: boolean, onClick: () => void }> = ({ task, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all ${
      active 
        ? 'bg-red-600/10 border border-red-500/30 text-red-100 shadow-md shadow-red-600/5' 
        : 'hover:bg-slate-800/50 border border-transparent text-slate-400 hover:text-slate-300'
    }`}
  >
    <div className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md font-mono text-[10px] font-bold ${
      active ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500'
    }`}>
      {task.id < 10 ? `0${task.id}` : task.id}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold truncate leading-tight">{task.title}</div>
      <div className="flex items-center gap-2 mt-1">
        <StatusBadge status={task.status} />
        {task.lastCheck && (
          <div className={`w-1.5 h-1.5 rounded-full ${task.lastCheck.status === 'PASS' ? 'bg-green-500' : 'bg-red-500'}`} />
        )}
      </div>
    </div>
  </button>
);

const StatusBadge: React.FC<{ status: TaskStatus }> = ({ status }) => {
  const styles = {
    [TaskStatus.IDLE]: 'text-slate-600',
    [TaskStatus.RUNNING]: 'text-green-500',
    [TaskStatus.STOPPED]: 'text-amber-500',
    [TaskStatus.STARTING]: 'text-red-400 animate-pulse'
  };

  return (
    <span className={`text-[9px] font-black uppercase tracking-widest ${styles[status]}`}>
      {status}
    </span>
  );
};

const ActionButton: React.FC<{ 
  label: string, 
  icon: React.ReactNode, 
  onClick: () => void, 
  disabled?: boolean,
  variant: 'green' | 'red' | 'blue'
}> = ({ label, icon, onClick, disabled, variant }) => {
  const colors = {
    green: 'bg-green-600 hover:bg-green-700',
    red: 'bg-red-600 hover:bg-red-700',
    blue: 'bg-slate-700 hover:bg-slate-600'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${colors[variant]} text-white shadow-sm`}
    >
      {icon}
      {label}
    </button>
  );
};

export default App;
