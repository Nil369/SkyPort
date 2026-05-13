import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Trash2, Edit, Terminal, Zap } from 'lucide-react';
import { vpsApi } from '@/services/api';
import { VPSAddEditForm } from './VPSAddEditForm';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

export interface VPSServer {
  id: string;
  server_name: string;
  ip_address: string;
  ssh_username: string;
  ssh_port: number;
  auth_type: 'key' | 'password';
  key_fingerprint: string;
  key_filename: string;
  tags: string[];
  notes: string;
  is_active: boolean;
  last_connection_time?: string;
  last_connection_user?: string;
  connection_count: number;
  status: 'online' | 'offline' | 'unreachable';
  status_check_time?: string;
  created_at: string;
  updated_at: string;
}

interface VPSListProps {
  onSelectVPS?: (vpsId: string) => void;
  onOpenTerminal?: (vpsId: string) => void;
}

export function VPSList({ onSelectVPS, onOpenTerminal }: VPSListProps) {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingVPS, setEditingVPS] = useState<VPSServer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch VPS list
  const { data, isLoading, error } = useQuery({
    queryKey: ['vps-list'],
    queryFn: () => vpsApi.listVPS({ offset: 0, limit: 100 }),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const handleOpenTerminal = (vps: VPSServer) => {
    onSelectVPS?.(vps.id);
    onOpenTerminal?.(vps.id);
  };

  // Delete VPS mutation
  const deleteMutation = useMutation({
    mutationFn: (vpsId: string) => vpsApi.deleteVPS(vpsId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vps-list'] });
      toast.success('VPS deleted successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete VPS: ${error.message}`);
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: (vpsId: string) => vpsApi.testConnection(vpsId),
    onSuccess: (result: any) => {
      if (result.success && result.data?.success) {
        toast.success('SSH connection successful!');
        queryClient.invalidateQueries({ queryKey: ['vps-list'] });
      } else {
        const errorMsg = result.data?.message || result.error || 'Unknown error';
        toast.error(`Connection failed: ${errorMsg}`);
      }
    },
    onError: (error: any) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  const vpsList = data?.data || [];
  const filteredList = vpsList.filter(
    (vps) =>
      vps.server_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vps.ip_address.includes(searchTerm)
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500/20 text-green-700 dark:text-green-400';
      case 'offline':
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400';
      case 'unreachable':
        return 'bg-red-500/20 text-red-700 dark:text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-700';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="Search by name or IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add VPS
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New VPS</DialogTitle>
              <DialogDescription>
                Configure a new VPS server for SSH access
              </DialogDescription>
            </DialogHeader>
            <VPSAddEditForm
              onSuccess={() => {
                setIsAddOpen(false);
                queryClient.invalidateQueries({ queryKey: ['vps-list'] });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-700 dark:text-red-400">
          Failed to load VPS servers
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          {searchTerm ? 'No VPS servers found matching your search' : 'No VPS servers yet'}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Server Name</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Connected</TableHead>
                <TableHead>Connections</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.map((vps) => (
                <TableRow key={vps.id}>
                  <TableCell className="font-medium">{vps.server_name}</TableCell>
                  <TableCell className="font-mono text-sm">{vps.ip_address}</TableCell>
                  <TableCell>{vps.ssh_username}</TableCell>
                  <TableCell>{vps.ssh_port}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(vps.status)}>
                      {vps.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                    {vps.last_connection_time
                      ? formatDistanceToNow(new Date(vps.last_connection_time), { addSuffix: true })
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-center">{vps.connection_count}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenTerminal(vps)}>
                          <Terminal className="w-4 h-4 mr-2" />
                          Open Terminal
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => testConnectionMutation.mutate(vps.id)}
                          disabled={testConnectionMutation.isPending}
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          Test Connection
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingVPS(vps)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteMutation.mutate(vps.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editingVPS !== null} onOpenChange={() => setEditingVPS(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit VPS</DialogTitle>
            <DialogDescription>Update VPS server configuration</DialogDescription>
          </DialogHeader>
          {editingVPS && (
            <VPSAddEditForm
              vps={editingVPS}
              onSuccess={() => {
                setEditingVPS(null);
                queryClient.invalidateQueries({ queryKey: ['vps-list'] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
