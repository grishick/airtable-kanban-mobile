import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { QUILL_JS, QUILL_CSS } from '../lib/quillBundle';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const MIN_HEIGHT = 220;

// Builds the self-contained Quill editor HTML.
// Uses String.raw for the JS block so backslashes in regex literals
// and '\n' string literals are preserved verbatim for the browser JS engine.
function buildEditorHTML(initialMarkdown: string): string {
  const escaped = JSON.stringify(initialMarkdown);

  const head = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>${QUILL_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#FAFBFC;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
.ql-toolbar.ql-snow{border:none;border-bottom:1.5px solid #DFE1E6;padding:4px 6px}
.ql-container.ql-snow{border:none}
.ql-editor{padding:10px 12px;font-size:15px;color:#172B4D;min-height:120px}
.ql-editor.ql-blank::before{color:#A5ADBA;font-style:normal;left:12px}
.ql-editor li[data-list="checked"]{color:#6B778C;text-decoration:line-through}
.ql-editor a{color:#0052CC;text-decoration:underline}
</style></head><body>
<div id="editor"></div>
<script>${QUILL_JS}</script>
<script>(function(){var INITIAL_MD=`;

  // String.raw preserves all backslashes verbatim so regex metacharacters
  // like \n, \s, \r, \d etc. pass through correctly into the embedded JS.
  const tail = String.raw`;
var Delta=Quill.import('delta');
var INLINE_RE=/(\*\*([^*\n]+)\*\*)|(~~([^~\n]+)~~)|(\`([^\`\n]+)\`)|\*([^*\n]+)\*(?!\*)|_([^_\n]+)_|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>\[\]()]+)/g;
function parseInlineOps(t){
  if(!t)return[];
  var ops=[],last=0,m;
  INLINE_RE.lastIndex=0;
  while((m=INLINE_RE.exec(t))!==null){
    if(m.index>last)ops.push({insert:t.slice(last,m.index)});
    if(m[1])ops.push({insert:m[2],attributes:{bold:true}});
    else if(m[3])ops.push({insert:m[4],attributes:{strike:true}});
    else if(m[5])ops.push({insert:m[6],attributes:{code:true}});
    else if(m[7])ops.push({insert:m[7],attributes:{italic:true}});
    else if(m[8])ops.push({insert:m[8],attributes:{italic:true}});
    else if(m[9])ops.push({insert:m[9],attributes:{link:m[10]}});
    else if(m[11])ops.push({insert:m[11],attributes:{link:m[11]}});
    else if(m[12])ops.push({insert:m[12],attributes:{link:m[12]}});
    last=INLINE_RE.lastIndex;
  }
  if(last<t.length)ops.push({insert:t.slice(last)});
  return ops;
}
function lineDeltaToInline(ld){
  var out='';
  ld.ops.forEach(function(op){
    if(typeof op.insert!=='string')return;
    var t=op.insert,a=op.attributes||{};
    if(a.code){out+='\`'+t+'\`';return;}
    var s=t;
    if(a.link)s='['+s+']('+a.link+')';
    if(a.strike)s='~~'+s+'~~';
    if(a.italic)s='*'+s+'*';
    if(a.bold)s='**'+s+'**';
    out+=s;
  });
  return out;
}
function markdownToDelta(md){
  var ops=[];
  var lines=(md||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  lines.forEach(function(line){
    var tr=line.trim();
    var cb=tr.match(/^(?:[-*+]\s+)?\[([ xX])\]\s*(.*)$/);
    if(cb){[].push.apply(ops,parseInlineOps(cb[2]));ops.push({insert:'\n',attributes:{list:/x/i.test(cb[1])?'checked':'unchecked'}});return;}
    var ord=tr.match(/^\d+[.)]\s+(.*)$/);
    if(ord){[].push.apply(ops,parseInlineOps(ord[1]));ops.push({insert:'\n',attributes:{list:'ordered'}});return;}
    var bul=tr.match(/^[-*+]\s+(.*)$/);
    if(bul){[].push.apply(ops,parseInlineOps(bul[1]));ops.push({insert:'\n',attributes:{list:'bullet'}});return;}
    if(tr)[].push.apply(ops,parseInlineOps(tr));
    ops.push({insert:'\n'});
  });
  return new Delta(ops.length?ops:[{insert:'\n'}]);
}
function deltaToMarkdown(delta){
  var lines=[],ord=0;
  delta.eachLine(function(ld,attrs){
    var t=lineDeltaToInline(ld),list=attrs.list;
    if(list==='ordered'){lines.push((++ord)+'. '+t);return;}
    ord=0;
    if(list==='bullet')lines.push('- '+t);
    else if(list==='checked')lines.push('- [x] '+t);
    else if(list==='unchecked')lines.push('- [ ] '+t);
    else lines.push(t);
  });
  return lines.join('\n').replace(/\s+$/,'');
}
var quill=new Quill('#editor',{
  theme:'snow',
  modules:{toolbar:[['bold','italic','strike','code'],[{list:'ordered'},{list:'bullet'},{list:'check'}],['link','clean']]},
  placeholder:'Optional details\u2026'
});
quill.setContents(markdownToDelta(INITIAL_MD),'silent');
function sendHeight(){
  var h=document.documentElement.scrollHeight;
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'height',value:h}));
}
quill.on('text-change',function(d,o,src){
  if(src==='silent')return;
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'change',markdown:deltaToMarkdown(quill.getContents())}));
  sendHeight();
});
quill.root.addEventListener('click',function(e){
  var a=e.target.closest('a[href]');
  if(a){e.preventDefault();window.ReactNativeWebView.postMessage(JSON.stringify({type:'link',url:a.getAttribute('href')||a.href}));}
});
function onRNMsg(e){
  try{
    var m=JSON.parse(e.data);
    if(m.type==='setValue'&&!quill.hasFocus()){quill.setContents(markdownToDelta(m.markdown),'silent');sendHeight();}
  }catch(err){}
}
document.addEventListener('message',onRNMsg);
window.addEventListener('message',onRNMsg);
setTimeout(sendHeight,200);
})();</script></body></html>`;

  return head + escaped + tail;
}

export default function RichTextEditor({ value, onChange }: Props) {
  const webViewRef = useRef<InstanceType<typeof WebView>>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const lastEmittedRef = useRef(value);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as {
        type: string;
        markdown?: string;
        value?: number;
        url?: string;
      };
      if (msg.type === 'change' && msg.markdown !== undefined) {
        lastEmittedRef.current = msg.markdown;
        onChange(msg.markdown);
      } else if (msg.type === 'height' && msg.value) {
        setHeight(Math.max(MIN_HEIGHT, msg.value));
      } else if (msg.type === 'link' && msg.url) {
        void Linking.openURL(msg.url);
      }
    } catch {}
  };

  // Sync external value changes into the editor (e.g. parent clears the form)
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const payload = JSON.stringify({ type: 'setValue', markdown: value });
    const js = `(function(){try{var e=new MessageEvent('message',{data:${JSON.stringify(payload)}});document.dispatchEvent(e);}catch(err){}})();true;`;
    webViewRef.current?.injectJavaScript(js);
  }, [value]);

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html: buildEditorHTML(value) }}
        onMessage={onMessage}
        scrollEnabled={false}
        cacheEnabled
        originWhitelist={['*']}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderColor: '#DFE1E6',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#FAFBFC',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
