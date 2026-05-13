import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { vpsApi } from '@/services/api';
import toast from 'react-hot-toast';
import type { VPSServer } from './VPSList';

interface CreateVPSRequest {
  server_name: string;
  ip_address: string;
  ssh_username: string;
  ssh_port: number;
  auth_type: 'key' | 'password';
  ssh_key_content?: string;
  ssh_key_filename?: string;
  password?: string;
  tags: string[];
  notes: string;
}

interface UpdateVPSRequest extends Partial<CreateVPSRequest> {
  is_active?: boolean;
}

interface VPSAddEditFormProps {
  vps?: VPSServer;
  onSuccess?: () => void;
  onClose?: () => void;
}

export function VPSAddEditForm({ vps, onSuccess, onClose: _onClose }: VPSAddEditFormProps) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CreateVPSRequest>({
    defaultValues: vps
      ? {
          server_name: vps.server_name,
          ip_address: vps.ip_address,
          ssh_username: vps.ssh_username,
          ssh_port: vps.ssh_port,
          auth_type: vps.auth_type,
          tags: vps.tags,
          notes: vps.notes,
        }
      : {
          ssh_port: 22,
          auth_type: 'key',
          tags: [],
          notes: '',
        },
  });

  const [tagInput, setTagInput] = useState('');
  const [keyFile, setKeyFile] = useState<File | null>(null);

  const authType = watch('auth_type');
  const tags = watch('tags');

  const createMutation = useMutation({
    mutationFn: (data: CreateVPSRequest) => vpsApi.createVPS(data),
    onSuccess: () => {
      toast.success('VPS created successfully');
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(`Failed to create VPS: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateVPSRequest) =>
      vpsApi.updateVPS(vps!.id, data),
    onSuccess: () => {
      toast.success('VPS updated successfully');
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(`Failed to update VPS: ${error.message}`);
    },
  });

  const onSubmit = async (data: CreateVPSRequest) => {
    // Handle key file if provided
    if (keyFile && authType === 'key') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const keyContent = e.target?.result as string;
        data.ssh_key_content = keyContent;
        data.ssh_key_filename = keyFile.name;

        if (vps) {
          updateMutation.mutate(data);
        } else {
          createMutation.mutate(data);
        }
      };
      reader.readAsText(keyFile);
    } else {
      if (vps) {
        updateMutation.mutate(data);
      } else {
        createMutation.mutate(data);
      }
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setValue('tags', [...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setValue('tags', tags.filter((t) => t !== tag));
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="server_name">Server Name *</Label>
          <Input
            id="server_name"
            placeholder="e.g., Production Web Server"
            {...register('server_name', { required: 'Server name is required' })}
          />
          {errors.server_name && (
            <span className="text-sm text-red-500">{errors.server_name.message}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ip_address">IP Address *</Label>
            <Input
              id="ip_address"
              placeholder="192.168.1.100"
              {...register('ip_address', { required: 'IP address is required' })}
            />
            {errors.ip_address && (
              <span className="text-sm text-red-500">{errors.ip_address.message}</span>
            )}
          </div>

          <div>
            <Label htmlFor="ssh_port">SSH Port *</Label>
            <Input
              id="ssh_port"
              type="number"
              defaultValue={22}
              {...register('ssh_port', { valueAsNumber: true })}
            />
            {errors.ssh_port && (
              <span className="text-sm text-red-500">{errors.ssh_port.message}</span>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="ssh_username">SSH Username *</Label>
          <Input
            id="ssh_username"
            placeholder="e.g., ubuntu, root, deploy"
            {...register('ssh_username', { required: 'SSH username is required' })}
          />
          {errors.ssh_username && (
            <span className="text-sm text-red-500">{errors.ssh_username.message}</span>
          )}
        </div>
      </div>

      {/* Authentication */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="auth_type">Authentication Type *</Label>
          <Select
            value={authType}
            onValueChange={(value) => setValue('auth_type', value as 'key' | 'password')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="key">SSH Key</SelectItem>
              <SelectItem value="password">Password</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {authType === 'key' ? (
          <div>
            <Label htmlFor="key_file">SSH Private Key *</Label>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500">
              <input
                type="file"
                id="key_file"
                accept=".pem,.ppk,.key"
                onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <label htmlFor="key_file" className="cursor-pointer">
                {keyFile ? (
                  <div>
                    <p className="font-medium text-green-600 dark:text-green-400">
                      {keyFile.name}
                    </p>
                    <p className="text-sm text-gray-500">Click to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">Drop SSH key here or click to browse</p>
                    <p className="text-sm text-gray-500">
                      Supported formats: .pem, .ppk, .key
                    </p>
                  </div>
                )}
              </label>
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor="password">Password *</Label>
            <Input
              id="password"
              type="password"
              placeholder="SSH password"
              {...register('password', vps ? {} : { required: 'Password is required' })}
            />
            {errors.password && (
              <span className="text-sm text-red-500">{errors.password.message}</span>
            )}
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <Label>Tags</Label>
        <div className="flex gap-2 mb-2">
          <Input
            placeholder="Add a tag (e.g., production, backup)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          />
          <Button type="button" variant="outline" onClick={addTag}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div
              key={tag}
              className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-sm flex items-center gap-2"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Add any additional notes about this VPS..."
          rows={3}
          {...register('notes')}
        />
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Saving...' : vps ? 'Update VPS' : 'Create VPS'}
      </Button>
    </form>
  );
}
