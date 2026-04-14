/**
 * SupabaseConsolePanel — Supabase Database Viewer + SQL Editor
 *
 * Tabs:
 *  📋 Tables — tree of schemas/tables, column inspector, row preview
 *  🖊 SQL Editor — multi-line editor, run SELECT queries, result grid
 *
 * Security note: queries go through the sql-console Edge Function which
 * enforces SELECT-only and MAX 500 rows server-side.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Database, Table2, ChevronRight, ChevronDown, Play,
  RefreshCw, Copy, Download, AlertCircle, Loader2,
  LayoutList, Code2, Key, Minus,
} from 'lucide-react';
import {
  SupabaseSqlService,
  type TableInfo,
  type ColumnInfo,
  type QueryResult,
} from '../services/SupabaseSqlService';

// ─── Theme colours ────────────────────────────────────────────────────────────
const C = {
  bg:         '#0a0a10',
  panel:      '#10101a',
  border:     'rgba(255,255,255,0.07)',
  accent:     '#3ecf8e',   // Supabase green
  accentDim:  'rgba(62,207,142,0.15)',
  text:       'rgba(255,255,255,0.88)',
  muted:      'rgba(255,255,255,0.40)',
  danger:     '#f87171',
  headerBg:   '#12121e',
  rowHover:   'rgba(255,255,255,0.04)',
  rowAlt:     'rgba(255,255,255,0.02)',
  tagPk:      'rgba(251,191,36,0.15)',
  tagPkText:  '#fbbf24',
  tagNull:    'rgba(148,163,184,0.12)',
  tagNullTxt: '#94a3b8',
};

// ─── Type badge ───────────────────────────────────────────────────────────────
const TypeBadge: React.FC<{ type: string }> = ({ type }) => (
  <span style={{
    fontSize: 10, padding: '1px 5px', borderRadius: 4,
    background: 'rgba(99,102,241,0.15)', color: '#818cf8',
    fontFamily: 'monospace',
  }}>
    {type}
  </span>
);

// ─── Cell value renderer ──────────────────────────────────────────────────────
function renderCell(val: unknown): React.ReactNode {
  if (val === null || val === undefined) {
    return <span style={{ color: C.muted, fontStyle: 'italic' }}>NULL</span>;
  }
  if (typeof val === 'boolean') {
    return (
      <span style={{ color: val ? C.accent : C.danger }}>{val ? 'true' : 'false'}</span>
    );
  }
  if (typeof val === 'object') {
    const str = JSON.stringify(val, null, 2);
    return (
      <span
        title={str}
        style={{ fontFamily: 'monospace', color: '#a5b4fc', cursor: 'default' }}
      >
        {str.length > 60 ? str.slice(0, 60) + '…' : str}
      </span>
    );
  }
  const str = String(val);
  return str.length > 80 ? (
    <span title={str}>{str.slice(0, 80)}…</span>
  ) : str;
}

// ─── Result grid ──────────────────────────────────────────────────────────────
const ResultGrid: React.FC<{ result: QueryResult }> = ({ result }) => {
  if (result.columns.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: C.muted }}>
        Query returned no columns.
      </div>
    );
  }
  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.headerBg, position: 'sticky', top: 0, zIndex: 1 }}>
            {result.columns.map(col => (
              <th key={col} style={{
                padding: '6px 12px', textAlign: 'left',
                borderBottom: `1px solid ${C.border}`,
                color: C.muted, fontWeight: 600, whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri} style={{
              background: ri % 2 === 0 ? 'transparent' : C.rowAlt,
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = C.rowHover)}
              onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? 'transparent' : C.rowAlt)}
            >
              {result.columns.map(col => (
                <td key={col} style={{
                  padding: '5px 12px',
                  borderBottom: `1px solid rgba(255,255,255,0.03)`,
                  color: C.text,
                  maxWidth: 300,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  fontFamily: 'monospace',
                  fontSize: 11,
                }}>
                  {renderCell(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Column inspector ─────────────────────────────────────────────────────────
const ColumnInspector: React.FC<{ columns: ColumnInfo[]; loading: boolean }> = ({
  columns, loading,
}) => {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, color: C.muted }}>
        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
        Loading columns…
      </div>
    );
  }
  if (columns.length === 0) return null;
  return (
    <div style={{ padding: '4px 0' }}>
      {columns.map(col => (
        <div key={col.name} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', fontSize: 11,
        }}>
          {col.isPrimary ? (
            <Key size={11} color={C.tagPkText} />
          ) : (
            <Minus size={11} color={C.muted} />
          )}
          <span style={{ color: C.text, fontFamily: 'monospace', minWidth: 120 }}>
            {col.name}
          </span>
          <TypeBadge type={col.type} />
          {!col.nullable && (
            <span style={{
              fontSize: 9, padding: '1px 4px', borderRadius: 3,
              background: C.tagPk, color: C.tagPkText,
            }}>NOT NULL</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Table tree item ──────────────────────────────────────────────────────────
interface TableItemProps {
  table:      TableInfo;
  selected:   boolean;
  onSelect:   () => void;
  onPreview:  () => void;
}

const TableItem: React.FC<TableItemProps> = ({ table, selected, onSelect, onPreview }) => {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onPreview}
      title={`Double-click to preview rows`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', cursor: 'pointer', fontSize: 12,
        background: selected ? C.accentDim : 'transparent',
        borderLeft: selected ? `2px solid ${C.accent}` : '2px solid transparent',
        transition: 'background 0.1s',
        color: selected ? C.accent : C.text,
      }}
    >
      <Table2 size={12} />
      <span style={{ flex: 1, fontFamily: 'monospace' }}>{table.name}</span>
      {table.type === 'view' && (
        <span style={{ fontSize: 9, color: C.muted }}>VIEW</span>
      )}
    </div>
  );
};

// ─── SQL Editor tab ───────────────────────────────────────────────────────────
const SqlEditor: React.FC<{
  onResult: (r: QueryResult) => void;
  onError:  (e: string) => void;
  onRunning: (b: boolean) => void;
  initialSql?: string;
}> = ({ onResult, onError, onRunning, initialSql = '' }) => {
  const [sql, setSql]       = useState(initialSql);
  const [running, setRunning] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialSql) setSql(initialSql);
  }, [initialSql]);

  const run = useCallback(async () => {
    const query = sql.trim();
    if (!query) return;
    setRunning(true);
    onRunning(true);
    try {
      const result = await SupabaseSqlService.runQuery(query);
      onResult(result);
      onError('');
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      onRunning(false);
    }
  }, [sql, onResult, onError, onRunning]);

  // Ctrl+Enter / Cmd+Enter to run
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        borderBottom: `1px solid ${C.border}`,
        background: C.headerBg,
      }}>
        <button
          onClick={run}
          disabled={running || !sql.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 6, border: 'none',
            background: running || !sql.trim() ? 'rgba(62,207,142,0.3)' : C.accent,
            color: running || !sql.trim() ? C.muted : '#000',
            cursor: running || !sql.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 12,
          }}
        >
          {running
            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Play size={13} />}
          Run
        </button>
        <span style={{ fontSize: 11, color: C.muted }}>Ctrl+Enter</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setSql('')}
          style={{
            background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Clear
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(sql)}
          style={{
            background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          }}
        >
          <Copy size={12} /> Copy
        </button>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, position: 'relative', minHeight: 160 }}>
        <textarea
          ref={taRef}
          value={sql}
          onChange={e => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={'-- SELECT * FROM your_table LIMIT 100\n-- Only SELECT queries are allowed.'}
          spellCheck={false}
          style={{
            width: '100%', height: '100%',
            background: '#0d0d18',
            color: '#a5f3fc',
            border: 'none',
            padding: '12px 14px',
            fontFamily: '"Fira Code", "Cascadia Code", monospace',
            fontSize: 13,
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            lineHeight: 1.6,
          }}
        />
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
interface SupabaseConsolePanelProps {
  theme?: string;
}

type ActiveTab = 'tables' | 'sql';

export const SupabaseConsolePanel: React.FC<SupabaseConsolePanelProps> = () => {
  const [activeTab,       setActiveTab]       = useState<ActiveTab>('tables');
  const [tables,          setTables]          = useState<TableInfo[]>([]);
  const [tablesLoading,   setTablesLoading]   = useState(false);
  const [selectedTable,   setSelectedTable]   = useState<string | null>(null);
  const [columns,         setColumns]         = useState<ColumnInfo[]>([]);
  const [columnsLoading,  setColumnsLoading]  = useState(false);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set(['public']));
  const [queryResult,     setQueryResult]     = useState<QueryResult | null>(null);
  const [queryError,      setQueryError]      = useState('');
  const [queryRunning,    setQueryRunning]    = useState(false);
  const [sqlToRun,        setSqlToRun]        = useState('');
  const [statusMsg,       setStatusMsg]       = useState('');

  // Load tables on mount
  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    setTablesLoading(true);
    try {
      const data = await SupabaseSqlService.listTables();
      setTables(data);
    } catch (e) {
      setStatusMsg(`Error loading tables: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTablesLoading(false);
    }
  };

  const selectTable = async (tableName: string) => {
    setSelectedTable(tableName);
    setColumnsLoading(true);
    setColumns([]);
    try {
      const cols = await SupabaseSqlService.listColumns(tableName);
      setColumns(cols);
    } catch {
      setColumns([]);
    } finally {
      setColumnsLoading(false);
    }
  };

  const previewTable = (tableName: string) => {
    setSqlToRun(`SELECT * FROM ${tableName} LIMIT 100`);
    setActiveTab('sql');
    setQueryResult(null);
    setQueryError('');
  };

  // Group tables by schema
  const bySchema = tables.reduce<Record<string, TableInfo[]>>((acc, t) => {
    (acc[t.schema] = acc[t.schema] ?? []).push(t);
    return acc;
  }, {});

  const toggleSchema = (schema: string) => {
    setExpandedSchemas(prev => {
      const next = new Set(prev);
      if (next.has(schema)) next.delete(schema);
      else next.add(schema);
      return next;
    });
  };

  const exportCsv = () => {
    if (!queryResult) return;
    const header = queryResult.columns.join(',');
    const rows = queryResult.rows.map(row =>
      queryResult.columns.map(col => {
        const v = row[col];
        if (v === null || v === undefined) return '';
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'query-result.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        borderBottom: `1px solid ${C.border}`,
        background: C.panel, flexShrink: 0,
      }}>
        <Database size={18} color={C.accent} />
        <span style={{ fontWeight: 700, fontSize: 14, color: C.accent }}>
          Supabase Console
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={loadTables}
          disabled={tablesLoading}
          style={{
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '4px 8px',
            color: C.muted, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
          }}
        >
          <RefreshCw
            size={12}
            style={{ animation: tablesLoading ? 'spin 1s linear infinite' : 'none' }}
          />
          Refresh
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: `1px solid ${C.border}`,
        background: C.panel, flexShrink: 0,
      }}>
        {([
          { id: 'tables', label: 'Tables', icon: LayoutList },
          { id: 'sql',    label: 'SQL Editor', icon: Code2 },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px',
              background: activeTab === tab.id ? C.accentDim : 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${C.accent}` : '2px solid transparent',
              color: activeTab === tab.id ? C.accent : C.muted,
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: Table browser (always visible) */}
        <div style={{
          width: 220, flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          background: C.panel,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 600,
            color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase',
            borderBottom: `1px solid ${C.border}`,
          }}>
            {tablesLoading ? 'Loading…' : `${tables.length} tables`}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {Object.entries(bySchema).map(([schema, schTables]) => (
              <div key={schema}>
                {/* Schema header */}
                <button
                  onClick={() => toggleSchema(schema)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '6px 12px', background: 'rgba(255,255,255,0.03)',
                    border: 'none', color: C.muted, cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {expandedSchemas.has(schema)
                    ? <ChevronDown size={11} />
                    : <ChevronRight size={11} />}
                  {schema}
                  <span style={{ marginLeft: 'auto', fontSize: 10 }}>
                    {schTables.length}
                  </span>
                </button>
                {/* Tables */}
                {expandedSchemas.has(schema) && schTables.map(t => (
                  <div key={t.name}>
                    <TableItem
                      table={t}
                      selected={selectedTable === t.name}
                      onSelect={() => selectTable(t.name)}
                      onPreview={() => previewTable(t.name)}
                    />
                    {selectedTable === t.name && (
                      <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderBottom: `1px solid ${C.border}`,
                      }}>
                        <ColumnInspector columns={columns} loading={columnsLoading} />
                        <div style={{
                          padding: '6px 12px',
                          display: 'flex', gap: 8,
                        }}>
                          <button
                            onClick={() => previewTable(t.name)}
                            style={{
                              fontSize: 10, padding: '3px 8px', borderRadius: 4,
                              background: C.accentDim, color: C.accent,
                              border: `1px solid ${C.accent}33`,
                              cursor: 'pointer',
                            }}
                          >
                            Preview rows →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {!tablesLoading && tables.length === 0 && (
              <div style={{ padding: 16, color: C.muted, fontSize: 12 }}>
                No tables found.<br />
                Make sure the sql-console Edge Function is deployed.
              </div>
            )}
          </div>
        </div>

        {/* Right: SQL editor or table view */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {activeTab === 'tables' && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.muted, fontSize: 13, flexDirection: 'column', gap: 8,
            }}>
              <Table2 size={32} color={C.muted} />
              <span>Select a table from the left to inspect columns.</span>
              <span style={{ fontSize: 11 }}>Double-click a table to preview rows in SQL Editor.</span>
            </div>
          )}

          {activeTab === 'sql' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Editor section */}
              <div style={{ height: 220, flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
                <SqlEditor
                  initialSql={sqlToRun}
                  onResult={r => { setQueryResult(r); setQueryError(''); setStatusMsg(''); }}
                  onError={e => { setQueryError(e); setQueryResult(null); }}
                  onRunning={setQueryRunning}
                />
              </div>

              {/* Status bar */}
              <div style={{
                padding: '4px 12px',
                background: C.headerBg,
                borderBottom: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: 11, color: C.muted, flexShrink: 0,
              }}>
                {queryRunning && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    Running…
                  </span>
                )}
                {queryResult && !queryRunning && (
                  <>
                    <span style={{ color: C.accent }}>
                      {queryResult.rowCount} row{queryResult.rowCount !== 1 ? 's' : ''}
                    </span>
                    {queryResult.durationMs !== undefined && (
                      <span>{queryResult.durationMs} ms</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={exportCsv}
                      style={{
                        background: 'none', border: 'none', color: C.muted,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 11,
                      }}
                    >
                      <Download size={11} /> Export CSV
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(
                        JSON.stringify(queryResult.rows, null, 2),
                      )}
                      style={{
                        background: 'none', border: 'none', color: C.muted,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 11,
                      }}
                    >
                      <Copy size={11} /> Copy JSON
                    </button>
                  </>
                )}
                {statusMsg && <span style={{ color: C.muted }}>{statusMsg}</span>}
              </div>

              {/* Results area */}
              <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                {queryError && (
                  <div style={{
                    margin: 12, padding: 12,
                    background: 'rgba(248,113,113,0.1)',
                    border: `1px solid rgba(248,113,113,0.25)`,
                    borderRadius: 8,
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    color: C.danger, fontSize: 12,
                  }}>
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <pre style={{ margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {queryError}
                    </pre>
                  </div>
                )}
                {queryResult && <ResultGrid result={queryResult} />}
                {!queryResult && !queryError && !queryRunning && (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.muted, fontSize: 12, flexDirection: 'column', gap: 8,
                  }}>
                    <Code2 size={28} color={C.muted} />
                    <span>Write a SELECT query above and press Run (Ctrl+Enter)</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spin keyframes */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
