import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
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
    const webViewRef = useRef<any>(null);
    const RNWebView = WebView as any;
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
    }, []); // Chỉ tạo HTML ban đầu 1 lần, sau đó dùng injectJavaScript để cập nhật dữ liệu

    const sendGraphData = () => {
      const graphEdges = (Array.isArray(edges) && edges.length > 0)
        ? edges
        : (Array.isArray(links) && links.length > 0 ? links : []);
      const updatePayload = JSON.stringify({
        type: 'UPDATE_DATA',
        nodes,
        edges: graphEdges,
      });
      webViewRef.current?.injectJavaScript(
        `window.postMessage(${JSON.stringify(updatePayload)}, '*'); true;`
      );
    };

    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        webViewRef.current?.injectJavaScript(
          `window.postMessage(JSON.stringify({ type: 'ZOOM_IN' }), '*'); true;`
        );
      },
      zoomOut: () => {
        webViewRef.current?.injectJavaScript(
          `window.postMessage(JSON.stringify({ type: 'ZOOM_OUT' }), '*'); true;`
        );
      },
      resetView: () => {
        webViewRef.current?.injectJavaScript(
          `window.postMessage(JSON.stringify({ type: 'RESET_VIEW' }), '*'); true;`
        );
      },
      selectNode: (nodeId: string | null) => {
        webViewRef.current?.injectJavaScript(
          `window.postMessage(JSON.stringify({ type: 'SELECT_NODE', nodeId: ${JSON.stringify(
            nodeId
          )} }), '*'); true;`
        );
      },
      setFilter: (filter: string | null) => {
        webViewRef.current?.injectJavaScript(
          `window.postMessage(JSON.stringify({ type: 'SET_FILTER', filter: ${JSON.stringify(
            filter
          )} }), '*'); true;`
        );
      },
    }));

    useEffect(() => {
      if (!webViewRef.current) return;
      if (!readyRef.current) {
        webViewRef.current?.injectJavaScript(
          `window.postMessage(JSON.stringify({ type: 'READY' }), '*'); true;`
        );
      }
    }, []);

    // Đồng bộ trạng thái khi selectedNodeId thay đổi
    useEffect(() => {
      webViewRef.current?.injectJavaScript(
        `window.postMessage(JSON.stringify({ type: 'SELECT_NODE', nodeId: ${JSON.stringify(
          selectedNodeId || null
        )} }), '*'); true;`
      );
    }, [selectedNodeId]);

    // Đồng bộ dữ liệu nodes/edges khi chúng thay đổi (sau khi tạo/sửa/xóa node)
    useEffect(() => {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        return;
      }
      sendGraphData();
    }, [nodes, edges, links]);

    // Đồng bộ trạng thái khi activeFilter thay đổi
    useEffect(() => {
      webViewRef.current?.injectJavaScript(
        `window.postMessage(JSON.stringify({ type: 'SET_FILTER', filter: ${JSON.stringify(
          activeFilter || null
        )} }), '*'); true;`
      );
    }, [activeFilter]);

    // Nhận thông điệp gửi từ WebView qua postMessage
    const handleMessage = (event: WebViewMessageEvent) => {
      try {
        const raw = event.nativeEvent?.data;
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!data || !data.type) return;

        if (data.type === 'READY') {
          readyRef.current = true;
          sendGraphData();
          return;
        }

        if (data.type === 'NODE_CLICK') {
          onNodeClick?.(data.nodeId, data.node);
        } else if (data.type === 'CANVAS_CLICK') {
          onCanvasClick?.();
        }
      } catch (err) {
        console.warn('[GraphWebView] Không thể phân tích message:', err);
      }
    };

    return (
      <View style={[styles.container, style]}>
        <RNWebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html }}
          style={styles.webView}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
          overScrollMode="never"
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          androidLayerType="hardware"
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
  webView: {
    flex: 1,
    backgroundColor: '#12100d',
  },
});
