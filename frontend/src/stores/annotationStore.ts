import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AnnotationType = 'highlight' | 'text' | 'draw' | 'rectangle';

export interface Annotation {
  id: string;
  type: AnnotationType;
  page?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  path?: Array<[number, number]>;
  timestamp: number;
}

export interface FileAnnotations {
  filePath: string;
  fileType: 'pdf' | 'image';
  annotations: Annotation[];
}

interface AnnotationState {
  annotationsByFile: Record<string, FileAnnotations>;
  activeAnnotation: Annotation | null;
  currentColor: string;
  currentTool: 'cursor' | 'highlight' | 'draw' | 'text' | 'rectangle' | 'eraser';
  
  setCurrentTool: (tool: 'cursor' | 'highlight' | 'draw' | 'text' | 'rectangle' | 'eraser') => void;
  setCurrentColor: (color: string) => void;
  addAnnotation: (filePath: string, fileType: 'pdf' | 'image', annotation: Annotation) => void;
  removeAnnotation: (filePath: string, annotationId: string) => void;
  updateAnnotation: (filePath: string, annotation: Annotation) => void;
  getAnnotations: (filePath: string) => FileAnnotations | undefined;
  clearAnnotations: (filePath: string) => void;
  setActiveAnnotation: (annotation: Annotation | null) => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  persist(
    (set, get) => ({
      annotationsByFile: {},
      activeAnnotation: null,
      currentColor: '#FF0000',
      currentTool: 'cursor',
      
      setCurrentTool: (tool) => set({ currentTool: tool }),
      setCurrentColor: (color) => set({ currentColor: color }),
      
      addAnnotation: (filePath, fileType, annotation) =>
        set((state) => {
          const key = filePath;
          const existing = state.annotationsByFile[key];
          const newAnnotations = existing 
            ? { ...existing, annotations: [...existing.annotations, annotation] } 
            : { filePath, fileType, annotations: [annotation] };
          return {
            annotationsByFile: {
              ...state.annotationsByFile,
              [key]: newAnnotations
            }
          };
        }),
        
      removeAnnotation: (filePath, annotationId) =>
        set((state) => {
          const key = filePath;
          const existing = state.annotationsByFile[key];
          if (!existing) return state;
          return {
            annotationsByFile: {
              ...state.annotationsByFile,
              [key]: {
                ...existing,
                annotations: existing.annotations.filter(a => a.id !== annotationId)
              }
            }
          };
        }),
        
      updateAnnotation: (filePath, annotation) =>
        set((state) => {
          const key = filePath;
          const existing = state.annotationsByFile[key];
          if (!existing) return state;
          return {
            annotationsByFile: {
              ...state.annotationsByFile,
              [key]: {
                ...existing,
                annotations: existing.annotations.map(a => a.id === annotation.id ? annotation : a)
              }
            }
          };
        }),
        
      getAnnotations: (filePath) => get().annotationsByFile[filePath],
      
      clearAnnotations: (filePath) =>
        set((state) => {
          const updated = { ...state.annotationsByFile };
          delete updated[filePath];
          return { annotationsByFile: updated };
        }),
        
      setActiveAnnotation: (annotation) => set({ activeAnnotation: annotation }),
    }),
    {
      name: 'skyport-pdf-annotations-v1',
    }
  )
);
