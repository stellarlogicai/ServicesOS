// src/components/AIModelTraining.jsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getTrainingData,
  getTrainingDataStats,
  addTrainingSample,
  verifyTrainingSample,
  deleteTrainingSample,
  exportTrainingData,
  getTrainingJobs,
  createTrainingJob,
  startTrainingJob,
  getCustomModels,
  deployModel,
  undeployModel,
  deleteModel,
  getDeployedModel
} from '../services/aiModelTrainingService';
import { checkCredits, deductCredits, getCreditCost } from '../services/aiUsageEngineService';

export default function AIModelTraining() {
  const { currentTenant } = useAuth();
  const [activeTab, setActiveTab] = useState('data');
  const [trainingData, setTrainingData] = useState(() => getTrainingData());
  const [stats, setStats] = useState(() => getTrainingDataStats());
  const [trainingJobs, setTrainingJobs] = useState(() => getTrainingJobs());
  const [customModels, setCustomModels] = useState(() => getCustomModels());
  const [deployedModel, setDeployedModel] = useState(() => getDeployedModel());
  const [message, setMessage] = useState({ type: '', text: '' });

  // Training job form
  const [trainingConfig, setTrainingConfig] = useState({
    modelType: 'classification',
    epochs: 10,
    batchSize: 32,
    learningRate: 0.001
  });

  const loadData = () => {
    setTrainingData(getTrainingData());
    setStats(getTrainingDataStats());
    setTrainingJobs(getTrainingJobs());
    setCustomModels(getCustomModels());
    setDeployedModel(getDeployedModel());
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleAddSample = () => {
    const sample = {
      roomType: 'living_room',
      cleaningType: 'standard',
      condition: 'moderate',
      estimatedPrice: 150,
      laborHours: 2,
      difficulty: 'medium',
      imageFeatures: {}
    };
    addTrainingSample(sample);
    loadData();
    showMessage('success', 'Training sample added');
  };

  const handleVerifySample = (sampleId, isCorrect) => {
    verifyTrainingSample(sampleId, isCorrect);
    loadData();
    showMessage('success', 'Sample verified');
  };

  const handleDeleteSample = (sampleId) => {
    deleteTrainingSample(sampleId);
    loadData();
    showMessage('success', 'Sample deleted');
  };

  const handleExportData = () => {
    const data = exportTrainingData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `training-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showMessage('success', 'Training data exported');
  };

  const handleStartTraining = async () => {
    // Check credits before training
    const creditCost = getCreditCost('estimate_generation'); // Using estimate_generation as a proxy for AI training
    if (currentTenant) {
      const creditCheck = await checkCredits(currentTenant.id, creditCost);
      if (!creditCheck.hasEnough) {
        showMessage('error', `Insufficient AI credits. You need ${creditCost} credit(s) but only have ${creditCheck.creditsRemaining} remaining.`);
        return;
      }
    }
    
    const job = createTrainingJob(trainingConfig);
    startTrainingJob(job.id);
    
    // Deduct credits after starting training
    if (currentTenant) {
      await deductCredits(currentTenant.id, creditCost, 'estimate_generation', { 
        jobId: job.id,
        modelType: trainingConfig.modelType,
        epochs: trainingConfig.epochs 
      });
    }
    
    loadData();
    showMessage('success', 'Training job started');
  };

  const handleDeployModel = (modelId) => {
    deployModel(modelId);
    loadData();
    showMessage('success', 'Model deployed');
  };

  const handleUndeployModel = (modelId) => {
    undeployModel(modelId);
    loadData();
    showMessage('success', 'Model undeployed');
  };

  const handleDeleteModel = (modelId) => {
    if (window.confirm('Are you sure you want to delete this model?')) {
      deleteModel(modelId);
      loadData();
      showMessage('success', 'Model deleted');
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          AI Model Training
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Train custom models on cleaning-specific data for better accuracy
        </p>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: message.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
          color: message.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Total Samples</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{stats.total}</div>
          </div>

          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Verified</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6' }}>{stats.verified}</div>
          </div>

          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Accuracy Rate</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#10b981' }}>
              {stats.verified > 0 ? Math.round((stats.correct / stats.verified) * 100) : 0}%
            </div>
          </div>

          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Custom Models</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6' }}>{customModels.length}</div>
          </div>
        </div>
      )}

      {/* Deployed Model Banner */}
      {deployedModel && (
        <div style={{
          padding: '16px',
          background: '#f0fdf4',
          borderRadius: 8,
          border: '1px solid #bbf7d0',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>
              🚀 Deployed Model: {deployedModel.name}
            </div>
            <div style={{ fontSize: 12, color: '#166534' }}>
              Accuracy: {(deployedModel.metrics.accuracy * 100).toFixed(1)}% · Deployed: {new Date(deployedModel.deployedAt).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={() => handleUndeployModel(deployedModel.id)}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: '#166534',
              border: '1px solid #bbf7d0',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Undeploy
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {['data', 'training', 'models'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab ? 'white' : 'transparent',
              color: activeTab === tab ? '#3b82f6' : '#64748b',
              border: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              borderBottom: activeTab === tab ? '2px solid white' : '2px solid #e2e8f0',
              borderRadius: '8px 8px 0 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: activeTab === tab ? -2 : 0
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Training Data Tab */}
      {activeTab === 'data' && (
        <div>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                Training Samples ({trainingData.length})
              </h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleAddSample}
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Add Sample
                </button>
                <button
                  onClick={handleExportData}
                  style={{
                    padding: '10px 20px',
                    background: 'white',
                    color: '#0f172a',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Export Data
                </button>
              </div>
            </div>

            {trainingData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                <p>No training data yet</p>
                <p style={{ fontSize: 14 }}>Add samples to start training custom models</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {trainingData.slice(0, 10).map(sample => (
                  <div
                    key={sample.id}
                    style={{
                      padding: '16px',
                      background: '#f8fafc',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                        {sample.roomType} · {sample.cleaningType}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {sample.condition} · ${sample.estimatedPrice} · {sample.laborHours}h
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        {sample.verified ? (
                          <span style={{ color: '#10b981' }}>✓ Verified</span>
                        ) : (
                          <span style={{ color: '#f59e0b' }}>⏳ Pending verification</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!sample.verified && (
                        <>
                          <button
                            onClick={() => handleVerifySample(sample.id, true)}
                            style={{
                              padding: '6px 12px',
                              background: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            ✓ Correct
                          </button>
                          <button
                            onClick={() => handleVerifySample(sample.id, false)}
                            style={{
                              padding: '6px 12px',
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fcd34d',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            ✗ Incorrect
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteSample(sample.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#fef2f2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {trainingData.length > 10 && (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: 14 }}>
                    Showing 10 of {trainingData.length} samples
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Training Tab */}
      {activeTab === 'training' && (
        <div>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            marginBottom: 24
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
              Start New Training Job
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Model Type
                </label>
                <select
                  value={trainingConfig.modelType}
                  onChange={(e) => setTrainingConfig({ ...trainingConfig, modelType: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                >
                  <option value="classification">Classification</option>
                  <option value="regression">Regression</option>
                  <option value="object_detection">Object Detection</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Epochs
                </label>
                <input
                  type="number"
                  value={trainingConfig.epochs}
                  onChange={(e) => setTrainingConfig({ ...trainingConfig, epochs: Number(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Batch Size
                </label>
                <input
                  type="number"
                  value={trainingConfig.batchSize}
                  onChange={(e) => setTrainingConfig({ ...trainingConfig, batchSize: Number(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Learning Rate
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={trainingConfig.learningRate}
                  onChange={(e) => setTrainingConfig({ ...trainingConfig, learningRate: Number(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
                />
              </div>
            </div>
            <button
              onClick={handleStartTraining}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Start Training
            </button>
          </div>

          {/* Training Jobs List */}
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
              Training Jobs ({trainingJobs.length})
            </h3>
            {trainingJobs.length === 0 ? (
              <p style={{ color: '#64748b' }}>No training jobs yet</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {trainingJobs.map(job => (
                  <div
                    key={job.id}
                    style={{
                      padding: '16px',
                      background: '#f8fafc',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                        {job.config.modelType} Model
                      </div>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        background: job.status === 'completed' ? '#dcfce7' : 
                                   job.status === 'training' ? '#dbeafe' : 
                                   job.status === 'cancelled' ? '#fef2f2' : '#f1f5f9',
                        color: job.status === 'completed' ? '#166534' : 
                               job.status === 'training' ? '#1e40af' : 
                               job.status === 'cancelled' ? '#991b1b' : '#64748b',
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {job.status}
                      </span>
                    </div>
                    {job.status === 'training' && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                          <span>Progress</span>
                          <span>{job.progress}%</span>
                        </div>
                        <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: '#3b82f6', width: `${job.progress}%` }} />
                        </div>
                      </div>
                    )}
                    {job.status === 'completed' && job.metrics && (
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Accuracy: {(job.metrics.accuracy * 100).toFixed(1)}% · Loss: {job.metrics.loss.toFixed(3)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Models Tab */}
      {activeTab === 'models' && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: 12,
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
            Custom Models ({customModels.length})
          </h3>
          {customModels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
              <p>No custom models yet</p>
              <p style={{ fontSize: 14 }}>Train a model to see it here</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {customModels.map(model => (
                <div
                  key={model.id}
                  style={{
                    padding: '16px',
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: model.isDeployed ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                      {model.name} {model.isDeployed && '🚀'}
                    </div>
                    <div style={{ fontSize: 14, color: '#64748b' }}>
                      {model.config.modelType} · v{model.version}
                    </div>
                    {model.metrics && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        Accuracy: {(model.metrics.accuracy * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!model.isDeployed && (
                      <button
                        onClick={() => handleDeployModel(model.id)}
                        style={{
                          padding: '8px 16px',
                          background: '#dcfce7',
                          color: '#166534',
                          border: '1px solid #bbf7d0',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Deploy
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteModel(model.id)}
                      style={{
                        padding: '8px 16px',
                        background: '#fef2f2',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
