import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
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
  focusRelation: (sourceId: string, targetId: string) => void;
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
    const readyRef = useRef(false);
    const pendingFocusRef = useRef<{ sourceId: string; targetId: string } | null>(null);

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

    const sendGraphData = useCallback(() => {
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
    }, [nodes, edges, links]);

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
      focusRelation: (sourceId: string, targetId: string) => {
        pendingFocusRef.current = { sourceId, targetId };
        if (readyRef.current) {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ type: 'FOCUS_RELATION', sourceId, targetId }),
            '*'
          );
          pendingFocusRef.current = null;
        }
      },
    }));

    useEffect(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'SELECT_NODE', nodeId: selectedNodeId || null }),
        '*'
      );
    }, [selectedNodeId]);

    // Chờ iframe sẵn sàng; khi sẵn sàng, READY sẽ gửi dữ liệu mới nhất.
    useEffect(() => {
      if (!readyRef.current) return;
      sendGraphData();
    }, [sendGraphData]);

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
            if (pendingFocusRef.current) {
              iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({
                  type: 'FOCUS_RELATION',
                  ...pendingFocusRef.current,
                }),
                '*'
              );
              pendingFocusRef.current = null;
            }
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
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ type: 'REQUEST_READY' }),
        '*'
      );
      return () => {
        window.removeEventListener('message', handleWindowMessage);
      };
    }, [onNodeClick, onCanvasClick, sendGraphData]);

    return (
      <View style={[styles.container, style]}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title="Graph WebView"
          onLoad={() =>
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ type: 'REQUEST_READY' }),
              '*'
            )
          }
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
