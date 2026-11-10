import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { generateGraphHtml } from './generateGraphHtml';

export interface GraphWebViewProps {
  nodes: any[];
  edges?: any[];
  links?: any[];
  selectedNodeId?: string | null;
  activeFilter?: string | null;
  onNodeClick?: (nodeId: string, node: any) => void;
  onCanvasClick?: () => void;
  style?: any;
}

export interface GraphWebViewRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  selectNode: (nodeId: string | null) => void;
  setFilter: (filter: string | null) => void;
}

export const GraphWebView = forwardRef<GraphWebViewRef, GraphWebViewProps>(
  (
    {
      nodes,
      edges,
      links,
      selectedNodeId,
      activeFilter,
      onNodeClick,
      onCanvasClick,
      style,
    },
    ref
  ) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const isFirstRender = useRef(true);
    const readyRef = useRef(false);

    const html = useMemo(() => {
      return generateGraphHtml({
        nodes,
        edges,
        links,
        selectedNodeId,
        activeFilter,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Chỉ tạo HTML ban đầu 1 lần

    const sendGraphData = () => {
      const graphEdges = (Array.isArray(edges) && edges.length > 0)
        ? edges
        : (Array.isArray(links) && links.length > 0 ? links : []);
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({
          type: 'UPDATE_DATA',
          nodes,
          edges: graphEdges,
        }),
        '*'
      );
    };

    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'ZOOM_IN' }),
          '*'
        );
      },
      zoomOut: () => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'ZOOM_OUT' }),
          '*'
        );
      },
      resetView: () => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'RESET_VIEW' }),
          '*'
        );
      },
      selectNode: (nodeId: string | null) => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'SELECT_NODE', nodeId: nodeId || null }),
          '*'
        );
      },
      setFilter: (filter: string | null) => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ type: 'SET_FILTER', filter: filter || null }),
          '*'
        );
      },
    }));

    useEffect(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'SELECT_NODE', nodeId: selectedNodeId || null }),
        '*'
      );
    }, [selectedNodeId]);

    // Đồng bộ dữ liệu nodes/edges khi chúng thay đổi
    useEffect(() => {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }
      sendGraphData();
    }, [nodes, edges, links]);

    useEffect(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'SET_FILTER', filter: activeFilter || null }),
        '*'
      );
    }, [activeFilter]);

    // Nhận thông điệp gửi từ iframe webview qua window.postMessage
    useEffect(() => {
      const handleWindowMessage = (event: MessageEvent) => {
        try {
          if (event.source !== iframeRef.current?.contentWindow) return;
          const raw = event.data;
          const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!data || !data.type) return;

          if (data.type === 'READY') {
            readyRef.current = true;
            sendGraphData();
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'READY' }), '*');
            return;
          }

          if (data.type === 'NODE_CLICK') {
            onNodeClick?.(data.nodeId, data.node);
          } else if (data.type === 'CANVAS_CLICK') {
            onCanvasClick?.();
          }
        } catch (err) {}
      };

      window.addEventListener('message', handleWindowMessage);
      return () => {
        window.removeEventListener('message', handleWindowMessage);
      };
    }, [onNodeClick, onCanvasClick]);

    return (
      <View style={[styles.container, style]}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title="Graph WebView"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: '#12100d',
          }}
        />
      </View>
    );
  }
);

GraphWebView.displayName = 'GraphWebView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#12100d',
    overflow: 'hidden',
  },
});

