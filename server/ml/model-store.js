const fs = require('fs');
const path = require('path');

const DEFAULT_MODEL_DIR = path.resolve(
  process.env.RETAILFLOW_MODEL_DIR || path.join(__dirname, '..', '..', 'data', 'ml'),
);

function artifactPath(name, modelDir = DEFAULT_MODEL_DIR) {
  return path.join(modelDir, name);
}

function modelPath(modelDir = DEFAULT_MODEL_DIR) {
  return artifactPath('deployed-model.json', modelDir);
}

function candidatePath(modelDir = DEFAULT_MODEL_DIR) {
  return artifactPath('candidate-model.json', modelDir);
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function saveModel(model, modelDir = DEFAULT_MODEL_DIR) {
  if (!model || model.schemaVersion !== 1 || !model.modelVersion) throw new Error('Invalid model artifact');
  writeAtomic(modelPath(modelDir), model);
  return model;
}

function loadModel(modelDir = DEFAULT_MODEL_DIR, file = modelPath(modelDir)) {
  if (!fs.existsSync(file)) return null;
  try {
    const model = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (model.schemaVersion !== 1 || !model.modelVersion || !model.interactions || !model.popularity) return null;
    return model;
  } catch (error) {
    return null;
  }
}

function saveCandidate(model, modelDir = DEFAULT_MODEL_DIR) {
  if (!model || model.schemaVersion !== 1 || !model.modelVersion) throw new Error('Invalid model artifact');
  writeAtomic(candidatePath(modelDir), model);
  return model;
}

function loadCandidate(modelDir = DEFAULT_MODEL_DIR) {
  return loadModel(modelDir, candidatePath(modelDir));
}

function deployCandidate(modelDir = DEFAULT_MODEL_DIR) {
  const candidate = loadCandidate(modelDir);
  if (!candidate) throw new Error('No valid candidate model to deploy');
  saveModel(candidate, modelDir);
  return candidate;
}

module.exports = {
  DEFAULT_MODEL_DIR,
  artifactPath,
  modelPath,
  candidatePath,
  saveModel,
  loadModel,
  saveCandidate,
  loadCandidate,
  deployCandidate,
};
