import { FormEvent, useMemo, useState } from 'react';
import { publicApi } from './public-api';

type LeadKind = 'DEMO' | 'CONTACT' | 'NEWSLETTER';

export function MarketingLeadForm({
  kind,
  compact = false,
  title,
  submitLabel,
}: {
  kind: LeadKind;
  compact?: boolean;
  title?: string;
  submitLabel?: string;
}) {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const [form, setForm] = useState({
    name: '', email: '', company: '', teamSize: '', message: '', website: '', consent: false,
  });
  const [status,setStatus]=useState<'idle'|'sending'|'success'|'error'>('idle');
  const [error,setError]=useState('');
  const newsletter=kind==='NEWSLETTER';
  const set=(key:string,value:string|boolean)=>setForm((current)=>({...current,[key]:value}));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus('sending'); setError('');
    try {
      await publicApi('/public/marketing/leads',{
        method:'POST',
        body:JSON.stringify({
          kind,
          name:form.name.trim()||undefined,
          email:form.email.trim(),
          company:form.company.trim()||undefined,
          teamSize:form.teamSize||undefined,
          message:form.message.trim()||undefined,
          website:form.website,
          consent:form.consent,
          sourcePath:`${window.location.pathname}${window.location.search}`,
          metadata:{
            intent:query.get('intent')??undefined,
            utmSource:query.get('utm_source')??undefined,
            utmMedium:query.get('utm_medium')??undefined,
            utmCampaign:query.get('utm_campaign')??undefined,
          },
        }),
      });
      setStatus('success');
      setForm({name:'',email:'',company:'',teamSize:'',message:'',website:'',consent:false});
    } catch (caught) {
      setStatus('error');
      setError(caught instanceof Error ? caught.message : 'Your request could not be submitted.');
    }
  }

  if(status==='success') return <div className={compact?'lead-success compact':'lead-success'} role="status"><span>✓</span><div><strong>{newsletter?'Update request saved.':'Request received.'}</strong><p>{newsletter?'We stored your request to receive product updates successfully.':'Your enquiry has been stored successfully so the team can follow up from the captured details.'}</p></div></div>;

  return <form className={compact?'lead-form compact':'lead-form'} onSubmit={submit}>
    {title?<h3>{title}</h3>:null}
    <label className="hp-field" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e)=>set('website',e.target.value)}/></label>
    {newsletter ? <label>Email address<input required type="email" maxLength={320} autoComplete="email" placeholder="you@company.com" value={form.email} onChange={(e)=>set('email',e.target.value)}/></label> :
      <div className="form-grid">
        <label>Full name<input required maxLength={160} autoComplete="name" placeholder="Your name" value={form.name} onChange={(e)=>set('name',e.target.value)}/></label>
        <label>Work email<input required type="email" maxLength={320} autoComplete="email" placeholder="you@company.com" value={form.email} onChange={(e)=>set('email',e.target.value)}/></label>
        <label>Company<input maxLength={160} autoComplete="organization" placeholder="Company name" value={form.company} onChange={(e)=>set('company',e.target.value)}/></label>
        <label>Team size<select value={form.teamSize} onChange={(e)=>set('teamSize',e.target.value)}><option value="">Select</option><option>1-5</option><option>6-20</option><option>21-50</option><option>51-200</option><option>201+</option></select></label>
      </div>}
    {!newsletter?<label>What would you like to improve?<textarea maxLength={4000} placeholder="Tell us about your meeting, webinar, scheduling, or collaboration workflow." value={form.message} onChange={(e)=>set('message',e.target.value)}/></label>:null}
    <label className="consent-row"><input required type="checkbox" checked={form.consent} onChange={(e)=>set('consent',e.target.checked)}/><span>{newsletter?'I agree that Sessions can use this email to send product updates.':'I agree that Sessions can use these details to respond to this request.'}</span></label>
    {status==='error'?<div className="form-error" role="alert">{error}</div>:null}
    <button className="button primary wide" disabled={status==='sending'||!form.email.trim()||!form.consent||(!newsletter&&!form.name.trim())}>{status==='sending'?'Submitting…':submitLabel??(newsletter?'Join updates':'Request a demo')}</button>
  </form>;
}
