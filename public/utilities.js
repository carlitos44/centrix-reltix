const energySuppliers={
  eneco:{name:'Eneco',url:'https://www.eneco.nl/klantenservice/'},
  vattenfall:{name:'Vattenfall',url:'https://www.vattenfall.nl/klantenservice/'}
};
if(demoAccount){
  const provider=energySuppliers[demoAccount.supplier];
  const card=document.getElementById('contract-provider');
  if(provider){
    card.innerHTML='<p class="kicker">Your energy contract</p><h3>'+provider.name+'</h3><p>Contact this supplier about your own energy contract, rates, or bills. For a network outage, use the network contact instead.</p><a href="'+provider.url+'" target="_blank" rel="noopener">'+provider.name+' customer service</a>';
  }else{
    card.textContent='No supplier is assigned yet. Check your energy bill for your supplier.';
  }
}
