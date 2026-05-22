import { FileText, Code2, Terminal, Database, Settings, Palette, Box, Zap, FileImage, FileAudio, FileVideo } from 'lucide-react';
import StackIcon from 'tech-stack-icons';
import type { IconName } from 'tech-stack-icons';

/**
 * Maps file extensions and language names to their tech stack icon names
 */
const LANGUAGE_TECH_STACK_MAP: Record<string, IconName | null> = {
  // JavaScript/TypeScript
  'js': 'javascript' as IconName,
  'jsx': 'javascript' as IconName,
  'ts': 'typescript' as IconName,
  'tsx': 'typescript' as IconName,
  'javascript': 'javascript' as IconName,
  'typescript': 'typescript' as IconName,
  'node': 'nodejs' as IconName,
  
  // Python
  'py': 'python' as IconName,
  'python': 'python' as IconName,
  'pyw': 'python' as IconName,
  
  // Go
  'go': 'go' as IconName,
  'golang': 'go' as IconName,
  
  // Java
  'java': 'java' as IconName,
  'class': 'java' as IconName,
  'jar': 'java' as IconName,
  
  // C/C++
  'c': 'c' as IconName,
  'cpp': 'cpp' as IconName,
  'cc': 'cpp' as IconName,
  'cxx': 'cpp' as IconName,
  'h': 'c' as IconName,
  'hpp': 'cpp' as IconName,
  
  // C#
  'cs': 'csharp' as IconName,
  'csharp': 'csharp' as IconName,
  '.net': 'dotnet' as IconName,
  'dotnet': 'dotnet' as IconName,
  
  // Ruby
  'rb': 'ruby' as IconName,
  'ruby': 'ruby' as IconName,
  'erb': 'ruby' as IconName,
  
  // PHP
  'php': 'php' as IconName,
  'phtml': 'php' as IconName,
  
  // Rust
  'rs': 'rust' as IconName,
  'rust': 'rust' as IconName,
  
  // SQL
  'sql': 'sql' as IconName,
  'mysql': 'mysql' as IconName,
  'postgresql': 'postgresql' as IconName,
  'mongodb': 'mongodb' as IconName,
  
  // JSON
  'json': 'json' as IconName,
  
  // YAML
  'yaml': 'yaml' as IconName,
  'yml': 'yaml' as IconName,
  
  // HTML/CSS
  'html': 'html5' as IconName,
  'htm': 'html5' as IconName,
  'css': 'css3' as IconName,
  'scss': 'sass' as IconName,
  'sass': 'sass' as IconName,
  'less': 'less' as IconName,
  
  // Markdown
  'md': 'markdown' as IconName,
  'markdown': 'markdown' as IconName,
  'mdx': 'markdown' as IconName,
  
  // Shell
  'sh': 'bash' as IconName,
  'bash': 'bash' as IconName,
  'zsh': 'bash' as IconName,
  'fish': 'bash' as IconName,
  'shell': 'bash' as IconName,
  'ps1': 'powershell' as IconName,
  'powershell': 'powershell' as IconName,
  
  // XML
  'xml': 'xml' as IconName,
  'svg': 'svg' as IconName,
  
  // Docker
  'dockerfile': 'docker' as IconName,
  
  // Git
  'gitignore': 'git' as IconName,
  'git': 'git' as IconName,
  
  // Web frameworks
  'react': 'react' as IconName,
  'vue': 'vue' as IconName,
  'angular': 'angular' as IconName,
  'svelte': 'svelte' as IconName,
  'nextjs': 'nextdotjs' as IconName,
  'express': 'express' as IconName,
  'nestjs': 'nestjs' as IconName,
  
  // Text/Config
  'txt': 'text' as IconName,
  'text': 'text' as IconName,
  'conf': null,
  'config': null,
  'env': null,
  'ini': null,
  'toml': null,
  'properties': null,
};

/**
 * Get the tech stack icon component for a given language
 * Falls back to Lucide icons if not available
 */
export function getTechStackIcon(
  language: string,
  className: string = 'h-4 w-4'
): React.ReactNode {
  const langLower = language?.toLowerCase() || '';
  const iconName = LANGUAGE_TECH_STACK_MAP[langLower];

  // Try to render tech-stack-icon if available
  if (iconName) {
    try {
      return (
        <StackIcon 
          name={iconName} 
          variant="dark"
          className={className}
          style={{ display: 'inline-block' }}
        />
      );
    } catch (e) {
      // Fallback if icon doesn't exist
    }
  }

  // Fallback to Lucide icons
  const fallbackIcons: Record<string, React.ReactNode> = {
    'typescript': <Code2 className={className} />,
    'javascript': <Code2 className={className} />,
    'python': <Terminal className={className} />,
    'go': <Zap className={className} />,
    'java': <Box className={className} />,
    'sql': <Database className={className} />,
    'html': <Palette className={className} />,
    'css': <Palette className={className} />,
    'json': <Settings className={className} />,
    'yaml': <Settings className={className} />,
    'yml': <Settings className={className} />,
    'markdown': <FileText className={className} />,
    'shell': <Terminal className={className} />,
    'bash': <Terminal className={className} />,
    'sh': <Terminal className={className} />,
    'png': <FileImage className={className} />,
    'jpg': <FileImage className={className} />,
    'jpeg': <FileImage className={className} />,
    'gif': <FileImage className={className} />,
    'webp': <FileImage className={className} />,
    'ico': <FileImage className={className} />,
    'svg': <FileImage className={className} />,
    'mp3': <FileAudio className={className} />,
    'wav': <FileAudio className={className} />,
    'ogg': <FileAudio className={className} />,
    'mp4': <FileVideo className={className} />,
    'webm': <FileVideo className={className} />,
    'mkv': <FileVideo className={className} />,
    'mov': <FileVideo className={className} />,
  };

  return fallbackIcons[langLower] || <FileText className={className} />;
}

/**
 * Get the display color for a tech stack icon
 */
export function getTechStackIconColor(): string {
  // Most tech icons inherit their colors from the StackIcon component
  return 'currentColor';
}
