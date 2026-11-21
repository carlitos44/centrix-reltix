// Local prototype only. The sample PINs and datasets are bundled with the site.
const demoAccounts={
  alex:{id:'alex',role:'tenant',name:'Alex Rivera',unit:'A-204',property:'wyck',supplier:'eneco',pin:'2040',moveIn:'2025-09-01',birthday:'2001-04-12',email:'alex.rivera@example.com',phone:'+31 43 555 0142'},
  jordan:{id:'jordan',role:'tenant',name:'Jordan Lee',unit:'B-107',property:'ceramique',supplier:'vattenfall',pin:'1070',moveIn:'2026-02-15',birthday:'2002-11-03',email:'jordan.lee@example.com',phone:'+31 43 555 0168'},
  mira:{id:'mira',role:'manager',name:'Mira van Dijk',properties:['wyck','ceramique'],pin:'6200'},
  noor:{id:'noor',role:'contractor',name:'Noor Bakker',pin:'4310'}
};
const demoProperties={
  wyck:{name:'Wyck Townhouse',caption:'Wyck · Maastricht',image:'property-wyck.jpg',alt:'Historic brick townhouses on Rechtstraat in Wyck, Maastricht',emailDomain:'wycktownhouse.example',address:'Wyck Townhouse, 10 Example Lane (fictional)',credit:'credits.html#wyck'},
  ceramique:{name:'Céramique Apartments',caption:'Céramique · Maastricht',image:'property-ceramique.jpg',alt:'Maison Céramique apartment building in Maastricht',emailDomain:'ceramiqueapartments.example',address:'Céramique Apartments, 18 Example Lane (fictional)',credit:'credits.html#ceramique'}
};
const sessionKey='centrix-demo-session-v1';
function getDemoAccount(){
  try {
    const id=sessionStorage.getItem(sessionKey);
    return Object.hasOwn(demoAccounts,id)?demoAccounts[id]:null;
  } catch {return null;}
}
const demoAccount=getDemoAccount();
const demoProperty=demoAccount?.role==='tenant'?demoProperties[demoAccount.property]:null;
const residentStorage={
  key(key){
    if(!demoAccount)throw new Error('Sign in to use resident storage.');
    return 'centrix-demo-v1:'+demoAccount.id+':'+key;
  },
  getItem(key){return demoAccount?localStorage.getItem(this.key(key)):null;},
  setItem(key,value){localStorage.setItem(this.key(key),value);},
  removeItem(key){localStorage.removeItem(this.key(key));}
};
const accountStatus=document.getElementById('account-status');
const profileDialog=document.getElementById('resident-profile');

function describeResidency(moveIn, today = new Date()){
  const [year,month,day]=moveIn.split('-').map(Number);
  const months=(today.getFullYear()-year)*12+today.getMonth()+1-month-Number(today.getDate()<day);
  if(months<1)return 'Less than a month';
  const years=Math.floor(months/12);
  const remaining=months%12;
  return [
    years ? years+' '+(years===1?'year':'years') : '',
    remaining ? remaining+' '+(remaining===1?'month':'months') : ''
  ].filter(Boolean).join(', ');
}

function openResidentProfile(){
  if(demoAccount?.role!=='tenant'||getDemoAccount()?.id!==demoAccount.id)return;
  const formatter=new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'UTC'});
  const fields={
    name:demoAccount.name,
    property:demoProperty.name,
    unit:demoAccount.unit,
    moveIn:formatter.format(new Date(demoAccount.moveIn)),
    tenure:describeResidency(demoAccount.moveIn),
    birthday:formatter.format(new Date(demoAccount.birthday)),
    email:demoAccount.email,
    phone:demoAccount.phone
  };
  for(const field of profileDialog.querySelectorAll('[data-profile-field]')){
    field.textContent=fields[field.dataset.profileField];
  }
  profileDialog.showModal();
}
profileDialog.addEventListener('close',()=>{
  for(const field of profileDialog.querySelectorAll('[data-profile-field]'))field.textContent='';
});

function showAccountGate(){
  if(profileDialog.open)profileDialog.close();
  for(const id of ['resident-portal','resident-nav','account-controls','manager-portal','contractor-portal'])document.getElementById(id).hidden=true;
  document.getElementById('account-gate').hidden=false;
}
function signOutDemo(){
  try {sessionStorage.removeItem(sessionKey);}
  catch {return;}
  showAccountGate();
  location.reload();
}
document.getElementById('demo-login').addEventListener('submit',event=>{
  event.preventDefault();
  const id=document.getElementById('account-id').value;
  const pin=document.getElementById('account-pin');
  const account=Object.hasOwn(demoAccounts,id)?demoAccounts[id]:null;
  if(!account||pin.value!==account.pin){
    accountStatus.textContent='That PIN does not match this account.';
    pin.value='';
    pin.focus();
    return;
  }
  try {sessionStorage.setItem(sessionKey,account.id);}
  catch {accountStatus.textContent='This browser could not sign you in.';return;}
  pin.value='';
  location.reload();
});
document.getElementById('demo-signout').onclick=signOutDemo;
if(demoAccount)document.getElementById('account-name').textContent=demoAccount.name;
if(demoAccount?.role==='manager'){
  document.getElementById('account-gate').hidden=true;
  document.getElementById('manager-portal').hidden=false;
  document.getElementById('account-controls').hidden=false;
  document.getElementById('account-context').textContent='Manager';
}
if(demoAccount?.role==='contractor'){
  document.getElementById('account-gate').hidden=true;
  document.getElementById('contractor-portal').hidden=false;
  document.getElementById('account-controls').hidden=false;
  document.getElementById('account-context').textContent='Heating contractor';
}
if(demoAccount?.role==='tenant'){
  document.getElementById('account-gate').hidden=true;
  for(const id of ['resident-portal','resident-nav','account-controls'])document.getElementById(id).hidden=false;
  document.querySelectorAll('[data-property-name]').forEach(element=>{element.textContent=demoProperty.name;});
  document.querySelectorAll('[data-property-email]').forEach(element=>{element.textContent=element.dataset.propertyEmail+'@'+demoProperty.emailDomain;});
  document.querySelectorAll('[data-property-address]').forEach(element=>{element.textContent=demoProperty.address+' · '+element.dataset.propertyAddress;});
  document.getElementById('property-caption').textContent=demoProperty.caption;
  document.getElementById('property-credit').href=demoProperty.credit;
  const profileButton=document.getElementById('open-profile');
  profileButton.hidden=false;
  profileButton.addEventListener('click',openResidentProfile);
  const photo=document.getElementById('property-image');
  photo.alt=demoProperty.alt;
  photo.src=demoProperty.image;
  document.getElementById('account-context').textContent='Unit '+demoAccount.unit;
}
window.addEventListener('pageshow',event=>{
  if(event.persisted&&getDemoAccount()?.id!==demoAccount?.id){showAccountGate();location.reload();}
});
