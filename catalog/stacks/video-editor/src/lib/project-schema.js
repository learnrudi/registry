import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeProjectDefaults } from '../config/defaults.js';
import { validateJsonSchema } from './json-schema.js';

const videoAgentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const projectSchemaPath = path.join(videoAgentRoot, 'schemas', 'project.schema.json');
let projectSchema = null;

async function loadProjectSchema() {
  if (projectSchema) {
    return projectSchema;
  }

  const content = await fs.readFile(projectSchemaPath, 'utf8');
  projectSchema = JSON.parse(content);
  return projectSchema;
}

export async function validateProject(project, label = 'project.json') {
  const normalizedProject = mergeProjectDefaults(project);
  const schema = await loadProjectSchema();
  validateJsonSchema(normalizedProject, schema, label);
  return normalizedProject;
}
