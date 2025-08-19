import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { getMonthlyCounts, getDailyCounts, getYTDTotal } from '../../src/lib/analytics';

type MonthRow = { month_start: string; submitted: number; cumulative: number };
type DayRow = { day: string; submitted: number };

const isWeb = Platform.OS === 'web';

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function nextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export default function AdminMetrics() {
  const { session, ready } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [contractStart, setContractStart] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<MonthRow[]>([]);
  const [daily,   setDaily]   = useState<DayRow[]>([]);
  const [ytd,     setYtd]     = useState<number>(0);

  // UI date range (defaults once we know team + contract start)
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd,   setRangeEnd]   = useState<string | null>(null);

  // bootstrap: team + contract_start_date
  useEffect(() => {
    (async () => {
      if (!ready || !session?.user) return;
      setLoading(true);

      // Get an admin team for this user
      const { data: tm } = await supabase
        .from('team_members')
        .select('team_id,is_admin')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1).maybeSingle();

      const tid = tm?.team_id ?? null;
      setTeamId(tid);

      if (tid) {
        const { data: t } = await supabase
          .from('teams')
          .select('contract_start_date')
          .eq('id', tid)
          .maybeSingle();

        const cStart = (t?.contract_start_date as string) || null;
        setContractStart(cStart);

        // Default range = from contract_start (or Jan 1) to end of next month boundary
        const now = new Date();
        const start = cStart ? cStart : `${now.getFullYear()}-01-01`;
        const end = toISO(nextMonth(now));
        setRangeStart(start);
        setRangeEnd(end);
      }

      setLoading(false);
    })();
  }, [ready, session?.user?.id]);

  // load analytics
  useEffect(() => {
    (async () => {
      if (!teamId || !rangeStart || !rangeEnd) return;
      setLoading(true);

      const [m, d, totalYtd] = await Promise.all([
        getMonthlyCounts(rangeStart, rangeEnd, { teamId }),
        getDailyCounts(
          // current month only
          toISO(monthStart(new Date())),
          toISO(new Date()),
          { teamId }
        ),
        getYTDTotal(new Date(), { teamId }),
      ]);

      setMonthly(m);
      setDaily(d);
      setYtd(totalYtd);
      setLoading(false);
    })();
  }, [teamId, rangeStart, rangeEnd]);

  if (!ready) return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator/></View>;
  if (!session?.user) return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Text>Signed out.</Text></View>;
  if (!teamId) {
    return (
      <View style={{flex:1,alignItems:'center',justifyContent:'center', padding:16}}>
        <Text style={{fontSize:22,fontWeight:'700', marginBottom:8}}>Metrics</Text>
        <Text>You’re not an admin on any team.</Text>
        <Pressable onPress={() => router.replace('/home')} style={{marginTop:12, padding:12, borderRadius:10, backgroundColor:'#2563eb'}}>
          <Text style={{color:'white', fontWeight:'700'}}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  const monthIndex = (s: string) => {
    if (!contractStart) return null;
    const a = new Date(contractStart);
    const b = new Date(s);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  };

  return (
    <View style={{ flex:1, padding:16 }}>
      <Text style={{fontSize:22,fontWeight:'700', marginBottom:8}}>Metrics</Text>

      {/* Date range pickers (web native inputs, simple text on native) */}
      <View style={{flexDirection:'row', gap:12, alignItems:'center', marginBottom:12}}>
        <Text>Start:</Text>
        {isWeb ? (
          <input type="date" value={rangeStart ?? ''} onChange={e => setRangeStart(e.currentTarget.value)} />
        ) : <Text>{rangeStart}</Text>}
        <Text>End:</Text>
        {isWeb ? (
          <input type="date" value={rangeEnd ?? ''} onChange={e => setRangeEnd(e.currentTarget.value)} />
        ) : <Text>{rangeEnd}</Text>}
      </View>

      {loading ? <ActivityIndicator/> : (
        <View style={{gap:12 as any}}>
          {/* 1) YTD */}
          <View style={{padding:12, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8}}>
            <Text style={{fontWeight:'700'}}>YTD total (as of today)</Text>
            <Text style={{fontSize:18}}>{ytd} submissions</Text>
          </View>

          {/* 2) Monthly buckets + cumulative */}
          <View style={{padding:12, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8}}>
            <Text style={{fontWeight:'700', marginBottom:6}}>Monthly</Text>
            {monthly.length === 0 ? <Text>No data in range.</Text> : monthly.map((r) => {
              const idx = monthIndex(r.month_start);
              const label = idx ? `Month ${idx}` : new Date(r.month_start).toLocaleDateString(undefined, {month:'short', year:'numeric'});
              return (
                <View key={r.month_start} style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:4}}>
                  <Text>{label} ({r.month_start})</Text>
                  <Text>{r.submitted} (cumulative {r.cumulative})</Text>
                </View>
              );
            })}
          </View>

          {/* 3) Current month daily (real-time) */}
          <View style={{padding:12, borderWidth:1, borderColor:'#e5e7eb', borderRadius:8}}>
            <Text style={{fontWeight:'700', marginBottom:6}}>This month (by day)</Text>
            {daily.length === 0 ? <Text>No submissions yet this month.</Text> : daily.map((r) => (
              <View key={r.day} style={{flexDirection:'row', justifyContent:'space-between', paddingVertical:2}}>
                <Text>{r.day}</Text>
                <Text>{r.submitted}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
