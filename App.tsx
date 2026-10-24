import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal,
  Platform, Pressable, ScrollView, Share, StatusBar, StyleSheet, Switch,
  Text, TextInput, View, AppState as NativeAppState,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {Ionicons} from '@expo/vector-icons';
import {addDays, dayKey, initialState, meals, officialResources, workTemplates, treatCategories, treatStatusLabel, nextTreatStatus, safePersonalLink} from './src/data';
import type {AppState, Assignee, FamilyEvent, Meal, Section, Task, Treat, TreatCategory} from './src/data';
import {clearPrivateNotification, enablePrivateDailyNotification} from './src/notifications';
import {colors as C, shadow} from './src/theme';

const STORAGE_KEY='pea.planner.v1'; // Keep key to migrate original Pea plans in place.
const PRIVATE_KEY='pea.personal_reminder.v1';
const ICON=require('./assets/icon.png');
type Tab='today'|'family'|'meals'|'work'|'pod';
type IconName=React.ComponentProps<typeof Ionicons>['name'];
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const unique=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const fmtDate=(d:Date)=>d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
const two=(n:number)=>String(n).padStart(2,'0');
const friendlyTime=(h:number,m:number)=>`${h%12||12}:${two(m)} ${h>=12?'PM':'AM'}`;
const defaultStarter=[
  ['Pack school lunches','home','Partner'],
  ['Do the dishes','home','Partner'],
  ['Choose dinner','home','Pankhuri'],
  ['Set out backpacks & clothes','home','Partner'],
] as const;
function withNewDay(old:AppState,date:string):AppState {
  if((old.preparedDates??[]).includes(date)) return old;
  // Routines are newly created only when a new calendar date begins; no data from BU.
  return {...old,preparedDates:[...(old.preparedDates??[]),date],tasks:[...old.tasks,...defaultStarter.map(([title,section,assignee],i)=>({id:`routine-${date}-${i}`,title,date,section,assignee,done:false}))]};
}
function SmallIcon({name,size=20,color=C.green}: {name:IconName;size?:number;color?:string}){return <Ionicons name={name} size={size} color={color}/>;}
function Card({children,style,pressed,onPress}:{children:React.ReactNode;style?:any;pressed?:boolean;onPress?:()=>void}){
  return onPress ? <Pressable onPress={onPress} style={[styles.card,style,pressed&&{opacity:.75}]}>{children}</Pressable>
    :<View style={[styles.card,style]}>{children}</View>;
}
function TinyLabel({children}:{children:React.ReactNode}){return <Text style={styles.tinyLabel}>{children}</Text>;}
function Action({title,onPress,icon,variant='green',style}:{title:string;onPress:()=>void;icon?:IconName;variant?:'green'|'pink'|'outline';style?:any}){
  const outline=variant==='outline';const bg=outline?C.white:variant==='pink'?C.pinkSoft:C.green;
  const fg=variant==='green'?C.white:C.text;
  return <Pressable onPress={onPress} style={({pressed})=>[styles.action,{backgroundColor:bg,borderWidth:outline?1:0,borderColor:C.line,opacity:pressed?.73:1},style]}>
    {icon&&<SmallIcon name={icon} size={16} color={fg}/>}<Text style={[styles.actionText,{color:fg}]}>{title}</Text>
  </Pressable>;
}
function Heading({title,subtitle,right}:{title:string;subtitle?:string;right?:React.ReactNode}){
  return <View style={styles.headingRow}><View style={{flex:1}}><Text style={styles.heading}>{title}</Text>{subtitle?<Text style={styles.subheading}>{subtitle}</Text>:null}</View>{right}</View>;
}
function TaskRow({task,onToggle,onLongPress,compact=false}:{task:Task;onToggle:()=>void;onLongPress?:()=>void;compact?:boolean}){
  return <Pressable onPress={onToggle} onLongPress={onLongPress} style={[styles.taskRow,compact&&{paddingVertical:11}]}>
    <SmallIcon name={task.done?'checkmark-circle':'ellipse-outline'} size={23} color={task.done?C.green:C.pink}/>
    <View style={{flex:1}}><Text style={[styles.taskTitle,task.done&&styles.strike]}>{task.title}</Text>{!compact?<Text style={styles.meta}>{task.assignee==='Partner'?'Partner’s list':'Pankhuri’s list'} · {task.section==='work'?'Work':'Home'}</Text>:null}</View>
  </Pressable>;
}
const recipeSteps:Record<string,string[]>={
  l1:['Spread cheese or a family-favorite filling over a tortilla.','Roll tightly, slice into little rounds and add washed berries.','Pack crunchy carrots separately with an ice pack.'],
  l2:['Cook pasta, rinse with cool water and drain well.','Add sliced cucumber and a little dressing if liked.','Pack with strawberries in a chilled lunchbox.'],
  l3:['Portion crackers, cheese cubes and apple slices into separate sections.','Add a sliced cucumber for crunch.','Keep chilled until lunchtime.'],
  l4:['Cut pita into dipping triangles.','Pack hummus in a leakproof container and add washed fruit and carrots.','Use an ice pack for food safety.'],
  l5:['Reheat cooked rice and protein thoroughly, then cool quickly.','Add vegetables and a favorite sauce in a separate container.','Refrigerate until packing; keep lunch safely chilled.'],
  d1:['Boil pasta according to the package.','Warm a little cream and pesto in a pan; stir in tomatoes.','Toss with cooked pasta and serve.'],
  d2:['Heat oven to 425°F / 220°C and cut potatoes into small pieces.','Toss chicken and vegetables with olive oil and seasoning on a sheet pan.','Roast until chicken reaches a safe internal temperature of 165°F / 74°C.'],
  d3:['Warm beans with seasoning and a splash of water.','Set out tortillas, shredded lettuce, cheese and diced tomatoes.','Let everyone build their own tacos.'],
  d4:['Scramble eggs in a pan and set aside.','Cook mixed vegetables, add leftover chilled rice and stir-fry until steaming hot.','Stir eggs back in and season with soy sauce.'],
  d5:['Cook chicken to 165°F / 74°C or warm paneer in a skillet.','Simmer with prepared butter chicken sauce.','Serve with cooked rice and a side of peas.'],
  d6:['Cook salmon to a safe internal temperature of 145°F / 63°C.','Prepare rice and slice cucumber.','Serve in bowls with a quick yogurt sauce.'],
};
const pill=(selected:boolean)=>({backgroundColor:selected?C.green:C.white,borderColor:selected?C.green:C.line});

function Main(){
  const [tab,setTab]=useState<Tab>('today');
  const [state,setState]=useState<AppState>(initialState);
  const [loaded,setLoaded]=useState(false);
  const [dateOffset,setDateOffset]=useState(0);
  const [dayAnchor,setDayAnchor]=useState(dayKey(new Date()));
  const [modal,setModal]=useState<'task'|'grocery'|'reminder'|'template'|'event'|'recipe'|'treat'|null>(null);
  const [eventTime,setEventTime]=useState('08:00');
  const [eventCategory,setEventCategory]=useState<FamilyEvent['category']>('School');
  const [newTitle,setNewTitle]=useState('');
  const [newSection,setNewSection]=useState<Section>('home');
  const [newAssignee,setNewAssignee]=useState<Assignee>('Partner');
  const [selectedTemplate,setSelectedTemplate]=useState(0);
  const [selectedRecipe,setSelectedRecipe]=useState<Meal>(meals[0]);
  const [hourValue,setHourValue]=useState('20');
  const [minuteValue,setMinuteValue]=useState('00');
  const [reminderLabel,setReminderLabel]=useState('Personal check-in');
  const [reminderVisible,setReminderVisible]=useState(false);
  const [notificationBusy,setNotificationBusy]=useState(false);
  const [podView,setPodView]=useState<'main'|'me'>('main');
  const [treatFilter,setTreatFilter]=useState<TreatCategory>('thriller');
  const [newTreatCategory,setNewTreatCategory]=useState<TreatCategory>('thriller');
  const [newTreatTitle,setNewTreatTitle]=useState('');
  const [newTreatNote,setNewTreatNote]=useState('');
  const [newTreatUrl,setNewTreatUrl]=useState('');

  const date=useMemo(()=>addDays(new Date(`${dayAnchor}T12:00:00`),dateOffset),[dayAnchor,dateOffset]);
  const key=dayKey(date);
  const todayKey=dayKey(new Date());
  const isToday=key===todayKey;
  const allTasks=useMemo(()=>state.tasks.filter(t=>t.date===key),[state.tasks,key]);
  const homeTasks=allTasks.filter(t=>t.section==='home');
  const calendarEvents=(state.events??[]).filter(e=>e.date===key).sort((a,b)=>a.time.localeCompare(b.time));
  const workTasks=allTasks.filter(t=>t.section==='work');
  const remaining=allTasks.filter(t=>!t.done);
  const chosen=state.mealChoices[key]??{};
  const lunch=meals.find(m=>m.id===chosen.lunch)??meals[0];
  const dinner=meals.find(m=>m.id===chosen.dinner)??meals.find(m=>m.kind==='dinner')!;
  const hasPrivateDone=state.reminder.doneDates.includes(key);
  const homeCompleted=homeTasks.filter(t=>t.done).length;

  useEffect(()=>{
    const sub=NativeAppState.addEventListener('change',status=>{if(status==='active')setDayAnchor(dayKey(new Date()));});
    return ()=>sub.remove();
  },[]);
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try {
        const [stored,privateStored]=await Promise.all([AsyncStorage.getItem(STORAGE_KEY), SecureStore.getItemAsync(PRIVATE_KEY)]);
        const parsed:AppState=stored?JSON.parse(stored):initialState();
        const privateData=privateStored?JSON.parse(privateStored):null;
        if(!mounted)return;
        const defaults=initialState();
        const safe={...defaults,...parsed,treats:Array.isArray(parsed.treats)?parsed.treats:[],events:parsed.events??[],preparedDates:parsed.preparedDates??[dayKey(new Date())],reminder:{...defaults.reminder,...(privateData??{})}};
        setState(withNewDay(safe,dayKey(new Date())));
      }catch(e){Alert.alert('Couldn’t load saved plans','Pea will start with a fresh local planner.');}
      finally{if(mounted)setLoaded(true);}
    })();
    return ()=>{mounted=false;};
  },[]);
  useEffect(()=>{
    if(!loaded)return;
    // Keep personal reminders and their completion history separate from the ordinary planner.
    AsyncStorage.setItem(STORAGE_KEY,JSON.stringify({...state,reminder:initialState().reminder})).catch(()=>{});
    SecureStore.setItemAsync(PRIVATE_KEY,JSON.stringify(state.reminder),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}).catch(()=>{});
  },[state,loaded]);
  // Prepare routines when browsing days, not just when restarting the app.
  useEffect(()=>{if(loaded)setState(s=>withNewDay(s,key));},[key,loaded]);
  const update=useCallback((fn:(s:AppState)=>AppState)=>setState(fn),[]);
  const toggleTask=(id:string)=>update(s=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,done:!t.done}:t)}));
  const confirmDeleteTask=(task:Task)=>Alert.alert('Remove this task?',task.title,[{text:'Keep',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>update(s=>({...s,tasks:s.tasks.filter(t=>t.id!==task.id)}))}]);
  const addTask=()=>{
    const title=newTitle.trim();if(!title)return;
    update(s=>({...s,tasks:[...s.tasks,{id:unique(),title,date:key,section:newSection,assignee:newAssignee,done:false}]}));
    setNewTitle('');setModal(null);
  };
  const addEvent=()=>{
    const title=newTitle.trim();if(!title)return;
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(eventTime)){Alert.alert('Check the time','Use 24-hour format, such as 08:30 or 15:45.');return;}
    update(s=>({...s,events:[...(s.events??[]),{id:unique(),date:key,title,time:eventTime,category:eventCategory}]}));
    setNewTitle('');setModal(null);
  };
  const addGrocery=()=>{
    const title=newTitle.trim();if(!title)return;
    update(s=>({...s,groceries:[...s.groceries,{id:unique(),title,done:false}]}));setNewTitle('');setModal(null);
  };
  const selectMeal=(kind:'lunch'|'dinner',direction=1)=>{
    const subset=meals.filter(m=>m.kind===kind);
    const now=kind==='lunch'?lunch:dinner;
    const idx=subset.findIndex(m=>m.id===now.id);
    const next=subset[(idx+direction+subset.length)%subset.length];
    update(s=>({...s,mealChoices:{...s.mealChoices,[key]:{...s.mealChoices[key],[kind]:next.id}}}));
  };
  const addMealGroceries=(meal:Meal)=>{
    update(s=>{
      const present=new Set(s.groceries.map(x=>x.title.toLowerCase()));
      const missing=meal.ingredients.filter(ingredient=>!present.has(ingredient.toLowerCase())).map(title=>({id:unique(),title,done:false}));
      return {...s,groceries:[...s.groceries,...missing]};
    });
    Alert.alert('Added to your list','Ingredients are ready in your grocery list.');
  };
  const toggleGrocery=(id:string)=>update(s=>({...s,groceries:s.groceries.map(g=>g.id===id?{...g,done:!g.done}:g)}));
  const togglePrivateToday=()=>update(s=>({...s,reminder:{...s.reminder,doneDates:hasPrivateDone?s.reminder.doneDates.filter(d=>d!==key):[...s.reminder.doneDates,key]}}));
  const openReminder=()=>{setHourValue(String(state.reminder.hour));setMinuteValue(two(state.reminder.minute));setReminderLabel(state.reminder.label);setReminderVisible(state.reminder.revealOnToday);setModal('reminder');};
  const saveReminder=async(enable:boolean)=>{
    if(notificationBusy)return;
    const hour=Number(hourValue),minute=Number(minuteValue);
    if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59){Alert.alert('Check the time','Please enter a 24-hour time such as 20 and 00.');return;}
    setNotificationBusy(true);
    try{
      let id:string|null=null;
      if(enable)id=await enablePrivateDailyNotification(hour,minute,state.reminder.notificationId);
      else await clearPrivateNotification(state.reminder.notificationId);
      update(s=>({...s,reminder:{...s.reminder,enabled:enable,label:reminderLabel.trim()||'Personal check-in',hour,minute,revealOnToday:reminderVisible,notificationId:id}}));
      setModal(null);
      Alert.alert(enable?'Private reminder is on':'Reminder is off',enable?'Your device will show a neutral daily Pea reminder.':'No personal daily notification is scheduled.');
    }catch(e){Alert.alert('Reminder could not be scheduled',e instanceof Error?e.message:'Check notification settings and try again.');}
    finally{setNotificationBusy(false);}
  };
  const openWebsite=async(url:string)=>{try{await Linking.openURL(url);}catch{Alert.alert('Unable to open link','Please try again later.');}};
  const shareGroceries=async()=>{try{await Share.share({message:'Pea grocery list ♡\n\n'+(state.groceries.filter(g=>!g.done).map(g=>'□ '+g.title).join('\n')||'Everything is checked off!')});}catch{Alert.alert('Could not share list','Try again from the grocery screen.');}};
  const shareTemplate=async()=>{try{await Share.share({message:workTemplates[selectedTemplate].body});}catch{Alert.alert('Unable to share','You can still select the template text.');}};
  const openRecipe=(meal:Meal)=>{setSelectedRecipe(meal);setModal('recipe');};
  const reset=()=>Alert.alert('Clear Pea’s plans?','This deletes tasks, meal choices and shopping lists stored on this device.',[
    {text:'Keep my plans',style:'cancel'},
    {text:'Clear local data',style:'destructive',onPress:async()=>{
      await clearPrivateNotification(state.reminder.notificationId);
      await AsyncStorage.removeItem(STORAGE_KEY);
      await SecureStore.deleteItemAsync(PRIVATE_KEY);
      setState(initialState());setTab('today');setDateOffset(0);
    }},
  ]);
  const openMeTime=(category?:TreatCategory)=>{if(category)setTreatFilter(category);setPodView('me');setTab('pod');};
  const openTreatModal=(category:TreatCategory)=>{
    setNewTreatCategory(category);setNewTreatTitle('');setNewTreatNote('');setNewTreatUrl('');setModal('treat');
  };
  const saveTreat=()=>{
    const title=newTreatTitle.trim(),url=newTreatUrl.trim();
    if(!title){Alert.alert('Give it a name','Add a book, movie, beauty item or video title.');return;}
    if(!safePersonalLink(url)){Alert.alert('Check your link','Use a full https:// link or leave the link blank.');return;}
    const treat:Treat={id:unique(),category:newTreatCategory,title,note:newTreatNote.trim(),url:url||undefined,status:'saved',createdAt:new Date().toISOString()};
    update(s=>({...s,treats:[treat,...(s.treats??[])]}));
    setTreatFilter(newTreatCategory);setModal(null);setPodView('me');setTab('pod');
  };
  const cycleTreat=(id:string)=>update(s=>({...s,treats:(s.treats??[]).map(t=>t.id===id?{...t,status:nextTreatStatus(t.status)}:t)}));
  const deleteTreat=(item:Treat)=>Alert.alert('Remove from your list?',item.title,[{text:'Keep',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>update(s=>({...s,treats:(s.treats??[]).filter(t=>t.id!==item.id)}))}]);
  const openAddEvent=()=>{setNewTitle('');setEventTime('08:00');setEventCategory('School');setModal('event');};
  const openAddTask=(section:Section='home')=>{setNewSection(section);setNewAssignee(section==='home'?'Partner':'Pankhuri');setNewTitle('');setModal('task');};

  function dayStrip(){return <View style={styles.dayStrip}>
    {Array.from({length:5},(_,i)=>i-2).map(n=>{
      const d=addDays(date,n),isSelected=n===0;
      return <Pressable key={n} onPress={()=>setDateOffset(v=>v+n)} style={[styles.dayChip,isSelected&&{backgroundColor:C.green,borderColor:C.green}]}>
        <Text style={[styles.dayWeekday,isSelected&&{color:C.white}]}>{weekdays[d.getDay()]}</Text>
        <Text style={[styles.dayNum,isSelected&&{color:C.white}]}>{d.getDate()}</Text>
      </Pressable>;
    })}
  </View>}

  function mealCard(meal:Meal,kind:'lunch'|'dinner'){
    return <Card style={{marginBottom:12,backgroundColor:kind==='lunch'?C.greenSoft:C.pinkSoft,borderWidth:0}}>
      <View style={styles.mealHeadline}><View style={{flex:1}}><TinyLabel>{kind==='lunch'?'KIDS’ LUNCH IDEA':'DINNER TONIGHT'}</TinyLabel><Text style={styles.mealName}>{meal.title}</Text><Text style={styles.meta}>{meal.minutes} min · {meal.description}</Text></View><Text style={{fontSize:42}}>{meal.emoji}</Text></View>
      <View style={styles.mealActions}><Action title="How to make" onPress={()=>openRecipe(meal)} icon="book-outline" variant="outline"/><Action title="Another" onPress={()=>selectMeal(kind)} icon="refresh-outline" variant="outline"/><Action title="Add groceries" onPress={()=>addMealGroceries(meal)} icon="basket-outline" variant="outline"/></View>
    </Card>;
  }

  function homeScreen(){
    const prioritized=remaining.slice(0,3);
    return <>
      <View style={styles.hero}>
        <View style={{flex:1}}><Text style={styles.eyebrow}>YOUR LITTLE DAILY SIDEKICK</Text><Text style={styles.greeting}>Hi, Pankhuri <Text style={{color:C.pink}}>♥</Text></Text><Text style={styles.heroSub}>One little thing at a time. You’ve got this.</Text></View>
        <Image source={ICON} style={styles.heroPea}/>
      </View>
      <Heading title="Today, made easier" subtitle={fmtDate(date)} right={<Pressable onPress={()=>setTab('family')} style={styles.smallRound}><SmallIcon name="calendar-outline"/></Pressable>}/>
      <View style={styles.twoTiles}>
        <Pressable style={[styles.tile,{backgroundColor:C.greenSoft}]} onPress={()=>setTab('family')}><View style={styles.tileIcon}><SmallIcon name="home-outline" size={23}/></View><Text style={styles.tileTitle}>Planner</Text><Text style={styles.tileSub}>Kids & routines</Text><SmallIcon name="arrow-forward" color={C.green}/></Pressable>
        <Pressable style={[styles.tile,{backgroundColor:C.pinkSoft}]} onPress={()=>setTab('work')}><View style={[styles.tileIcon,{backgroundColor:C.white}]}><SmallIcon name="briefcase-outline" size={22}/></View><Text style={styles.tileTitle}>Work</Text><Text style={styles.tileSub}>New admits & emails</Text><SmallIcon name="arrow-forward" color={C.green}/></Pressable>
      </View>
      <View style={{height:21}}/>
      <Heading title="Your next three things" subtitle="Small steps, calmer days." right={<Action title="Add" onPress={()=>openAddTask()} icon="add" variant="outline"/>}/>
      <Card>
        {prioritized.length?prioritized.map((t,i)=><View key={t.id}>{i>0?<View style={styles.separator}/>:null}<TaskRow task={t} onToggle={()=>toggleTask(t.id)} onLongPress={()=>confirmDeleteTask(t)} compact/></View>):<View style={styles.empty}><SmallIcon name="sparkles-outline" size={24} color={C.pink}/><Text style={styles.body}>All clear for now. Take a moment for yourself.</Text></View>}
        {remaining.length>3?<Pressable onPress={()=>setTab('family')} style={{paddingTop:13}}><Text style={styles.link}>See the rest of your day →</Text></Pressable>:null}
      </Card>
      <View style={{height:18}}/>
      <Pressable onPress={()=>setTab('family')} style={styles.progressCard}>
        <View style={{flex:1}}><TinyLabel>EVENING RESET</TinyLabel><Text style={styles.cardTitle}>{homeCompleted} of {homeTasks.length} home tasks done</Text><Text style={styles.meta}>Dishes, lunches and bags—one small step at a time</Text></View>
        <View style={styles.progressRing}><Text style={styles.progressText}>{homeTasks.length?Math.round(homeCompleted/homeTasks.length*100):100}%</Text></View>
      </Pressable>
      <View style={{height:22}}/>
      <Pressable onPress={()=>openMeTime()} style={styles.meTimeHero} accessibilityRole="button" accessibilityLabel="Open Me Time favorites and wishlists">
        <View style={[styles.tileIcon,{backgroundColor:C.white}]}><SmallIcon name="heart-outline" size={23} color={C.pink}/></View>
        <View style={{flex:1}}><Text style={styles.cardTitle}>A little time for you ♡</Text><Text style={styles.meta}>Books, movies, beauty & TikTok finds</Text></View>
        <SmallIcon name="chevron-forward" color={C.green}/>
      </Pressable>
      <View style={{height:22}}/>
      <Heading title="Less thinking, more living" subtitle="A plan for food, without the mental load"/>
      {mealCard(dinner,'dinner')}{mealCard(lunch,'lunch')}
      {state.reminder.enabled && state.reminder.revealOnToday?<>
        <Heading title="A private little check-in"/>
        <Card><TaskRow task={{id:'private',title:state.reminder.label,assignee:'Pankhuri',section:'home',date:key,done:hasPrivateDone}} onToggle={togglePrivateToday} compact/><Text style={styles.meta}>For you only · {friendlyTime(state.reminder.hour,state.reminder.minute)}</Text></Card>
        <View style={{height:18}}/>
      </>:null}
      <Text style={styles.warmFooter}>A little help with a lot of life. ♡</Text>
    </>;
  }

  function familyScreen(){
    const personTasks=(assignee:Assignee)=>homeTasks.filter(t=>t.assignee===assignee);
    return <>
      <Heading title="The family planner ♡" subtitle="Everything the kids need, in one calm place"/>
      {dayStrip()}
      <Card style={{backgroundColor:C.greenSoft,borderWidth:0}}>
        <View style={styles.inline}><View style={{flex:1}}><TinyLabel>EVENING RESET</TinyLabel><Text style={styles.cardTitle}>A calmer tomorrow starts here</Text><Text style={styles.meta}>Lunches · dishes · backpacks · dinner</Text></View><Text style={{fontSize:40}}>🌷</Text></View>
      </Card>
      <View style={{height:17}}/>
      <Heading title="This week" subtitle="Tap a day to see its tasks and plans"/>
      <View style={styles.weekStrip}>{Array.from({length:7},(_,i)=>i).map(i=>{
        const d=addDays(new Date(),i), dk=dayKey(d), count=(state.events??[]).filter(e=>e.date===dk).length;
        return <Pressable key={dk} onPress={()=>setDateOffset(i)} style={[styles.weekDay,dk===key&&styles.weekDayActive]}>
          <Text style={[styles.weekDayName,dk===key&&{color:C.white}]}>{weekdays[d.getDay()]}</Text>
          <Text style={[styles.weekDayNum,dk===key&&{color:C.white}]}>{d.getDate()}</Text>
          <View style={[styles.eventDot,{opacity:count?1:0,backgroundColor:dk===key?C.white:C.pink}]}/>
        </Pressable>;
      })}</View>
      <View style={{height:20}}/>
      <Heading title="Family schedule" subtitle="The school events, appointments & plans that matter" right={<Action title="Add event" icon="add" variant="outline" onPress={openAddEvent}/>}/>
      <Card style={{marginBottom:21}}>{calendarEvents.length?calendarEvents.map((ev,i)=><View key={ev.id}>{i>0?<View style={styles.separator}/>:null}<View style={styles.inline}><View style={styles.calendarTime}><Text style={{color:C.green,fontSize:11,fontWeight:'700'}}>{ev.time}</Text></View><View style={{flex:1}}><Text style={styles.cardTitle}>{ev.title}</Text><Text style={styles.meta}>{ev.category}</Text></View><Pressable onPress={()=>Alert.alert('Remove this event?',ev.title,[{text:'Keep',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>update(s=>({...s,events:s.events.filter(x=>x.id!==ev.id)}))}])}><SmallIcon name="close-circle-outline" color={C.muted}/></Pressable></View></View>):<Text style={styles.meta}>No plans added for this day. Tap “Add event” for school dates, pickups or appointments.</Text>}</Card>
      <Heading title="Your side of the team" subtitle="Share the work—not just the reminders" right={<Action title="Add chore" onPress={()=>openAddTask('home')} icon="add" variant="outline"/>}/>
      <Card><View style={styles.groupHead}><SmallIcon name="heart-outline" size={17} color={C.pink}/><Text style={styles.groupTitle}>Partner’s list</Text></View>
      {personTasks('Partner').length?personTasks('Partner').map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggleTask(t.id)} onLongPress={()=>confirmDeleteTask(t)}/>):<Text style={styles.meta}>Nothing assigned yet.</Text>}
      <View style={styles.separator}/><View style={styles.groupHead}><SmallIcon name="flower-outline" size={17} color={C.pink}/><Text style={styles.groupTitle}>Pankhuri’s list</Text></View>
      {personTasks('Pankhuri').length?personTasks('Pankhuri').map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggleTask(t.id)} onLongPress={()=>confirmDeleteTask(t)}/>):<Text style={styles.meta}>Nothing assigned yet.</Text>}
      </Card>
      <Text style={styles.tipText}>Tip: Touch and hold a task to remove it.</Text>
      <View style={{height:8}}/>
      <Heading title="The kids’ little routines"/>
      <View style={styles.twoTiles}>
        <Card style={[styles.miniRoutine,{backgroundColor:C.pinkSoft,borderWidth:0}]}><Text style={{fontSize:30}}>🎒</Text><Text style={styles.cardTitle}>School mornings</Text><Text style={styles.meta}>Bags, lunches, water bottles</Text></Card>
        <Card style={[styles.miniRoutine,{backgroundColor:C.greenSoft,borderWidth:0}]}><Text style={{fontSize:30}}>🌙</Text><Text style={styles.cardTitle}>Evening reset</Text><Text style={styles.meta}>Kitchen clear, clothes ready</Text></Card>
      </View>
      <View style={{height:16}}/>
      <Card style={{backgroundColor:C.white}}><Text style={styles.cardTitle}>You don’t have to hold every detail.</Text><Text style={styles.body}>Give dishes and lunch prep an owner. Pea keeps the plan visible so the whole family can breathe.</Text></Card>
    </>;
  }

  function mealsScreen(){return <>
    <Heading title="Meals, without the stress" subtitle="Fewer decisions. Happier evenings."/>
    {dayStrip()}
    {mealCard(lunch,'lunch')}{mealCard(dinner,'dinner')}
    <Heading title="Grocery list" subtitle="Tap ingredients as you pick them up" right={<View style={{flexDirection:"row",gap:7}}><Action title="Share" icon="share-outline" variant="outline" onPress={shareGroceries}/><Action title="Add" icon="add" variant="outline" onPress={()=>{setNewTitle('');setModal('grocery');}}/></View>}/>
    <Card>{state.groceries.length?state.groceries.map((g,i)=><View key={g.id}>{i>0?<View style={styles.separator}/>:null}<Pressable onPress={()=>toggleGrocery(g.id)} style={styles.groceryRow}><SmallIcon name={g.done?'checkbox':'square-outline'} color={g.done?C.green:C.pink} size={23}/><Text style={[styles.taskTitle,{flex:1},g.done&&styles.strike]}>{g.title}</Text></Pressable></View>):<Text style={styles.meta}>The list is empty. Add what you need.</Text>}</Card>
    {state.groceries.some(g=>g.done)?<Pressable onPress={()=>update(s=>({...s,groceries:s.groceries.filter(g=>!g.done)}))} style={styles.textButton}><Text style={styles.link}>Remove checked items</Text></Pressable>:null}
    <Text style={styles.tipText}>Tip: Dinner leftovers can become tomorrow's lunch. Start with what you already have.</Text>
  </>}

  function workScreen(){return <>
    <Heading title="Work, a little lighter" subtitle="For newly admitted international students"/>
    <Card style={{backgroundColor:C.greenSoft,borderWidth:0}}><View style={styles.inline}><View style={{flex:1}}><TinyLabel>WORKFLOW COMPANION</TinyLabel><Text style={styles.cardTitle}>One step at a time</Text><Text style={styles.body}>Templates, checklists and official links—without copying confidential student information into Pea.</Text></View><Text style={{fontSize:42}}>💻</Text></View></Card>
    <View style={{height:20}}/>
    <Heading title="Today's work checklist" right={<Action title="Add" onPress={()=>openAddTask('work')} icon="add" variant="outline"/>}/>
    <Card>{workTasks.length?workTasks.map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggleTask(t.id)} onLongPress={()=>confirmDeleteTask(t)}/>):<Text style={styles.meta}>No work tasks yet. Add a general task to get started.</Text>}</Card>
    <View style={{height:20}}/>
    <Heading title="Quick email & processing guides" subtitle="Editable examples to use in approved BU tools"/>
    {workTemplates.map((t,i)=><Card key={t.title} style={{marginBottom:10}} onPress={()=>{setSelectedTemplate(i);setModal('template');}}><View style={styles.inline}><View style={[styles.tileIcon,{backgroundColor:i===1?C.pinkSoft:C.greenSoft}]}><SmallIcon name={i===2?'list-outline':i===1?'school-outline':'mail-outline'} size={22}/></View><View style={{flex:1}}><Text style={styles.cardTitle}>{t.title}</Text><Text style={styles.meta}>{t.subtitle}</Text></View><SmallIcon name="chevron-forward" color={C.muted}/></View></Card>)}
    <View style={{height:14}}/>
    <Card style={{backgroundColor:C.pinkSoft,borderWidth:0}} onPress={()=>setTab('pod')}>
      <View style={styles.inline}><View style={styles.linkIcon}><SmallIcon name="leaf-outline"/></View>
        <View style={{flex:1}}><Text style={styles.cardTitle}>Find official resources in Pea Pod</Text><Text style={styles.meta}>Travel guidance, SEVP, SEVIS & regulations</Text></View>
        <SmallIcon name="chevron-forward" color={C.muted}/></View>
    </Card>
    <Text style={styles.tipText}>Verify country restrictions, D/S requirements and SEVIS procedures with official agencies and university-approved policies. Pea does not make immigration determinations.</Text>
  </>}

  function meTimeScreen(){
    const picked=(state.treats??[]).filter(t=>t.category===treatFilter);
    const category=treatCategories.find(c=>c.id===treatFilter)!;
    const total=(state.treats??[]).length;
    return <>
      <Pressable onPress={()=>setPodView('main')} style={styles.backLink}><SmallIcon name="arrow-back" color={C.green}/><Text style={styles.link}>Back to Pea Pod</Text></Pressable>
      <Heading title="Your happy place ♡" subtitle="A little corner that’s only about you" right={<Action title="Add" onPress={()=>openTreatModal(treatFilter)} icon="add" variant="pink"/>}/>
      <Card style={{backgroundColor:C.pinkSoft,borderWidth:0,marginBottom:18}}>
        <View style={styles.inline}><Text style={{fontSize:34}}>💗</Text><View style={{flex:1}}><Text style={styles.cardTitle}>More of what you love.</Text><Text style={styles.body}>Save a book, plan a movie night, or remember that lip gloss. No chores allowed in here.</Text></View></View>
      </Card>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:18}} contentContainerStyle={{gap:8,paddingRight:8}}>
        {treatCategories.map(cat=><Pressable key={cat.id} onPress={()=>setTreatFilter(cat.id)} style={[styles.interestChip,treatFilter===cat.id&&{backgroundColor:C.green,borderColor:C.green}]}><Text style={{fontSize:15}}>{cat.emoji}</Text><Text style={[styles.interestChipText,treatFilter===cat.id&&{color:C.white}]}>{cat.name}</Text></Pressable>)}
      </ScrollView>
      <Heading title={`${category.emoji} ${category.name}`} subtitle={category.description}/>
      {picked.length?picked.map(t=><Pressable key={t.id} onLongPress={()=>deleteTreat(t)} style={[styles.card,{marginBottom:11}]} accessibilityRole="button" accessibilityHint="Long press to remove">
        <View style={styles.inline}><View style={{flex:1}}><Text style={styles.cardTitle}>{t.title}</Text>{t.note?<Text style={styles.body}>{t.note}</Text>:null}</View><Pressable onPress={()=>cycleTreat(t.id)} style={styles.statusChip}><Text style={{color:C.green,fontWeight:'700',fontSize:11}}>{treatStatusLabel(t.category,t.status)} ↻</Text></Pressable></View>
        {t.url?<Pressable onPress={()=>openWebsite(t.url!)} style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:11}}><SmallIcon name="link-outline" color={C.green} size={15}/><Text style={styles.link}>Open saved link</Text></Pressable>:null}
      </Pressable>):<Card style={{backgroundColor:C.greenSoft,borderWidth:0}}><Text style={styles.cardTitle}>Your list is a blank page ♡</Text><Text style={styles.body}>Add something you're excited about. It'll stay here until you want it.</Text><View style={{marginTop:14,alignItems:'flex-start'}}><Action title={`Add to ${category.name}`} icon="add" variant="outline" onPress={()=>openTreatModal(treatFilter)}/></View></Card>}
      {treatFilter==='beauty'?<Pressable onPress={()=>openWebsite('https://www.sephora.com/')} style={styles.textButton}><Text style={styles.link}>Browse Sephora ↗</Text></Pressable>:null}
      {treatFilter==='tiktok'?<Text style={styles.tipText}>Found a video you love? Use Share → Copy link in TikTok, then paste it into Pea.</Text>:null}
      <View style={{height:15}}/><Text style={styles.warmFooter}>{total} little {total===1?'favorite':'favorites'} saved · just for you ♡</Text>
    </>;
  }

  function podScreen(){if(podView==='me')return meTimeScreen();return <>
    <Heading title="Pea Pod ♡" subtitle="Your cozy corner for little reminders & resources"/>
    <Card style={{backgroundColor:C.pinkSoft,borderWidth:0}}><View style={styles.inline}><Image source={ICON} style={{height:65,width:65,borderRadius:16}}/><View style={{flex:1}}><Text style={styles.cardTitle}>A little pea, just for you ♡</Text><Text style={styles.body}>Made with love for Pankhuri.</Text></View></View></Card>
    <View style={{height:20}}/>
    <Heading title="Your happy place" subtitle="Books, movies, makeup & favorite finds"/>
    <View style={styles.happyGrid}>
      {treatCategories.map(cat=><Pressable key={cat.id} onPress={()=>openMeTime(cat.id)} style={[styles.happyTile,{backgroundColor:cat.id==='romance'||cat.id==='beauty'?C.pinkSoft:C.greenSoft}]}>
        <Text style={{fontSize:24}}>{cat.emoji}</Text><Text style={styles.happyTileTitle}>{cat.name}</Text>
        <Text style={styles.meta}>{(state.treats??[]).filter(t=>t.category===cat.id).length} saved</Text>
      </Pressable>)}
    </View>
    <View style={{height:22}}/>
    <Heading title="Private reminders" subtitle="Only you decide what to track"/>
    <Card onPress={openReminder}><View style={styles.inline}><View style={[styles.linkIcon,{backgroundColor:C.pinkSoft}]}><SmallIcon name="notifications-outline"/></View><View style={{flex:1}}><Text style={styles.cardTitle}>Daily personal check-in</Text><Text style={styles.meta}>{state.reminder.enabled?`On · ${friendlyTime(state.reminder.hour,state.reminder.minute)}`:'Off · tap to set up'}</Text></View><SmallIcon name="chevron-forward" color={C.muted}/></View></Card>
    {state.reminder.enabled?<Card style={{marginTop:12,backgroundColor:C.greenSoft,borderWidth:0}}><View style={styles.inline}><View style={{flex:1}}><Text style={styles.cardTitle}>{state.reminder.label}</Text><Text style={styles.meta}>{hasPrivateDone?'Done for today ♡':'Your check-in for today'}</Text></View><Pressable onPress={togglePrivateToday} style={{padding:9}}><SmallIcon name={hasPrivateDone?'checkmark-circle':'ellipse-outline'} size={27} color={hasPrivateDone?C.green:C.pink}/></Pressable></View></Card>:null}
    <View style={{height:20}}/>
    <Heading title="Helpful places" subtitle="Always check the original government guidance"/>
    {officialResources.map(item=><Card key={item.url} style={{marginBottom:9}} onPress={()=>openWebsite(item.url)}><View style={styles.inline}><View style={styles.linkIcon}><SmallIcon name="leaf-outline"/></View><View style={{flex:1}}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.meta}>{item.agency}</Text></View><SmallIcon name="open-outline" color={C.muted}/></View></Card>)}
    <View style={{height:15}}/>
    <Heading title="Made to feel peaceful"/>
    <Card><View style={styles.inline}><SmallIcon name="lock-closed-outline"/><View style={{flex:1}}><Text style={styles.cardTitle}>Private by default</Text><Text style={styles.body}>Plans stay on this device, with personal-reminder details kept in encrypted device storage. No accounts, analytics or advertising.</Text></View></View><View style={styles.separator}/><View style={styles.inline}><SmallIcon name="shield-checkmark-outline"/><View style={{flex:1}}><Text style={styles.cardTitle}>No student records</Text><Text style={styles.body}>Do not enter student names, passport numbers, immigration records or BU credentials here.</Text></View></View></Card>
    <Pressable style={styles.textButton} onPress={reset}><Text style={{color:C.danger,fontWeight:'600'}}>Clear locally saved plans</Text></Pressable>
    <Text style={styles.warmFooter}>pea. · Made with love ♡</Text>
  </>}

  function treatModal(){return <>
    <Text style={styles.modalTitle}>Save a little favorite ♡</Text><Text style={styles.modalSub}>A book, movie, makeup find or TikTok you'll want to remember.</Text>
    <TinyLabel>ADD TO YOUR LIST</TinyLabel>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:16}} contentContainerStyle={{gap:7}}>
      {treatCategories.map(cat=><Pressable key={cat.id} onPress={()=>setNewTreatCategory(cat.id)} style={[styles.interestChip,newTreatCategory===cat.id&&{backgroundColor:C.green,borderColor:C.green}]}><Text style={[styles.interestChipText,newTreatCategory===cat.id&&{color:C.white}]}>{cat.emoji} {cat.name}</Text></Pressable>)}
    </ScrollView>
    <TinyLabel>NAME *</TinyLabel><TextInput style={styles.input} placeholder="Book, movie, product or video" placeholderTextColor={C.muted} autoFocus maxLength={120} value={newTreatTitle} onChangeText={setNewTreatTitle}/>
    <TinyLabel>YOUR NOTE (OPTIONAL)</TinyLabel><TextInput style={[styles.input,{minHeight:72,textAlignVertical:'top'}]} multiline placeholder="Why you saved it, shade name, a recommendation…" placeholderTextColor={C.muted} value={newTreatNote} onChangeText={setNewTreatNote} maxLength={300}/>
    <TinyLabel>LINK (OPTIONAL)</TinyLabel><TextInput style={styles.input} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://…" placeholderTextColor={C.muted} value={newTreatUrl} onChangeText={setNewTreatUrl} maxLength={600}/>
    <Action title="Save to my happy place" icon="heart-outline" onPress={saveTreat}/>
    <Text style={styles.tipText}>Private, local-only favorites. Tap a status to change it; long-press a saved item to remove it.</Text>
  </>}

  function recipeModal(){
    const m=selectedRecipe;
    const steps=recipeSteps[m.id]??['Gather all ingredients and prep the vegetables.','Cook ingredients thoroughly using your preferred recipe or package directions.','Serve and pack any leftovers safely.'];
    return <>
      <View style={styles.recipeHero}><Text style={{fontSize:44}}>{m.emoji}</Text><View style={{flex:1}}><TinyLabel>{m.kind==='lunch'?'LUNCHBOX IDEA':'DINNER IDEA'}</TinyLabel><Text style={styles.modalTitle}>{m.title}</Text><Text style={styles.meta}>{m.minutes} minutes · {m.description}</Text></View></View>
      <Heading title="What you’ll need"/><Card style={{marginBottom:16}}>{m.ingredients.map((item,i)=><Text key={i} style={[styles.taskTitle,{paddingVertical:5}]}>• {item}</Text>)}</Card>
      <Heading title="Simple steps"/><Card>{steps.map((step,i)=><View key={i} style={{flexDirection:'row',gap:12,marginVertical:7}}><View style={styles.stepNumber}><Text style={{color:C.white,fontWeight:'700'}}>{i+1}</Text></View><Text style={[styles.body,{flex:1,marginTop:1}]}>{step}</Text></View>)}</Card>
      <Action title="Add ingredients to groceries" icon="basket-outline" onPress={()=>{addMealGroceries(m);setModal(null);}} style={{marginTop:16}}/>
      <Text style={styles.tipText}>Double-check allergens, safe cooking temperatures and your children’s food needs before preparing.</Text>
    </>;
  }

  function taskModal(){return <>
    <Text style={styles.modalTitle}>Add one little thing</Text><Text style={styles.modalSub}>Make it easy to see who handles what.</Text>
    <TextInput style={styles.input} placeholder="What needs to get done?" placeholderTextColor={C.muted} value={newTitle} onChangeText={setNewTitle} autoFocus maxLength={100} returnKeyType="done" onSubmitEditing={addTask}/>
    <TinyLabel>THIS BELONGS TO</TinyLabel><View style={styles.choiceRow}>{(['home','work'] as Section[]).map(v=><Pressable key={v} onPress={()=>{setNewSection(v);if(v==='work')setNewAssignee('Pankhuri');}} style={[styles.choice,pill(newSection===v)]}><Text style={[styles.choiceText,newSection===v&&{color:C.white}]}>{v==='home'?'🏡 Home':'💻 Work'}</Text></Pressable>)}</View>
    <TinyLabel>WHO'S TAKING CARE OF IT?</TinyLabel><View style={styles.choiceRow}>{(['Partner','Pankhuri'] as Assignee[]).map(v=><Pressable key={v} onPress={()=>setNewAssignee(v)} style={[styles.choice,pill(newAssignee===v)]}><Text style={[styles.choiceText,newAssignee===v&&{color:C.white}]}>{v==='Partner'?'My partner':v}</Text></Pressable>)}</View>
    <Action title="Add to the day" icon="add-circle-outline" onPress={addTask} style={{marginTop:20}}/>
  </>}

  function eventModal(){return <>
    <Text style={styles.modalTitle}>A date to remember</Text><Text style={styles.modalSub}>{fmtDate(date)} · Keep the family's plans together.</Text>
    <TinyLabel>WHAT'S HAPPENING?</TinyLabel><TextInput style={styles.input} placeholder="School concert, pickup, appointment..." placeholderTextColor={C.muted} value={newTitle} onChangeText={setNewTitle} maxLength={100} autoFocus/>
    <TinyLabel>TIME (24-HOUR FORMAT)</TinyLabel><TextInput style={styles.input} value={eventTime} onChangeText={setEventTime} placeholder="15:30" placeholderTextColor={C.muted} maxLength={5} keyboardType="numbers-and-punctuation"/>
    <TinyLabel>TYPE</TinyLabel><View style={styles.choiceRow}>{(['School','Family','Appointment'] as FamilyEvent['category'][]).map(v=><Pressable key={v} onPress={()=>setEventCategory(v)} style={[styles.choice,pill(eventCategory===v)]}><Text style={[styles.choiceText,eventCategory===v&&{color:C.white}]}>{v}</Text></Pressable>)}</View>
    <Action title="Save event" icon="calendar-outline" onPress={addEvent}/>
  </>}

  function reminderModal(){return <>
    <Text style={styles.modalTitle}>A private daily reminder ♡</Text><Text style={styles.modalSub}>For medicine, vitamins or anything personal. Optional, private and fully controlled by you.</Text>
    <View style={styles.privacyCallout}><SmallIcon name="lock-closed" size={19}/><Text style={[styles.body,{flex:1}]}>Phone notifications will simply say “Your private daily check-in is ready.” No medication names are shown.</Text></View>
    <TinyLabel>YOUR PRIVATE LABEL (INSIDE PEA ONLY)</TinyLabel>
    <TextInput style={styles.input} value={reminderLabel} onChangeText={setReminderLabel} placeholder="Personal check-in" placeholderTextColor={C.muted} maxLength={50}/>
    <TinyLabel>REMIND ME AT (24-HOUR TIME)</TinyLabel>
    <View style={styles.timeRow}><TextInput style={[styles.input,styles.timeInput]} keyboardType="number-pad" maxLength={2} value={hourValue} onChangeText={setHourValue} selectTextOnFocus/><Text style={styles.timeColon}>:</Text><TextInput style={[styles.input,styles.timeInput]} keyboardType="number-pad" maxLength={2} value={minuteValue} onChangeText={setMinuteValue} selectTextOnFocus/><Text style={styles.meta}>e.g. 20:00 = 8 PM</Text></View>
    <View style={styles.inline}><View style={{flex:1}}><Text style={styles.cardTitle}>Show this on Today?</Text><Text style={styles.meta}>Off keeps the reminder out of the dashboard</Text></View><Switch value={reminderVisible} onValueChange={setReminderVisible} trackColor={{false:C.line,true:C.greenMid}} thumbColor={C.green}/></View>
    {notificationBusy?<ActivityIndicator color={C.green} style={{marginTop:14}}/>:<>
      <Action title={state.reminder.enabled?'Save reminder':'Turn on my reminder'} icon="notifications-outline" onPress={()=>saveReminder(true)} style={{marginTop:20}}/>
      {state.reminder.enabled?<Action title="Turn off reminder" variant="outline" onPress={()=>saveReminder(false)} style={{marginTop:10}}/>:null}
    </>}
    <Text style={styles.tipText}>Pea is a simple reminder, not a medical device. If a dose is missed, follow the medicine's instructions or ask a clinician or pharmacist.</Text>
  </>}

  const tabs:{id:Tab;name:string;icon:IconName;active:IconName}[]=[
    {id:'today',name:'Home',icon:'home-outline',active:'home'},
    {id:'family',name:'Planner',icon:'calendar-outline',active:'calendar'},
    {id:'meals',name:'Meals',icon:'restaurant-outline',active:'restaurant'},
    {id:'work',name:'Work',icon:'briefcase-outline',active:'briefcase'},
    {id:'pod',name:'Pea Pod',icon:'leaf-outline',active:'leaf'},
  ];
  return <SafeAreaProvider><SafeAreaView style={styles.safe} edges={['top','bottom']}><StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
    <View style={styles.topBar}><View style={styles.brand}><Image source={ICON} style={styles.brandImage}/><Text style={styles.brandText}>pea<Text style={{color:C.pink}}>.</Text></Text></View><Text style={styles.topTag}>made just for you ♡</Text><Pressable onPress={()=>{setPodView('main');setTab('pod');}} style={styles.avatar}><SmallIcon name="person-outline" size={19}/></Pressable></View>
    {!loaded?<View style={styles.loading}><ActivityIndicator size="large" color={C.green}/><Text style={styles.meta}>Opening Pea...</Text></View>:
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {tab==='today'?homeScreen():tab==='family'?familyScreen():tab==='meals'?mealsScreen():tab==='work'?workScreen():podScreen()}
      </ScrollView>}
    <View style={styles.bottomTabs}>{tabs.map(t=><Pressable key={t.id} style={styles.tab} onPress={()=>{if(t.id==='pod')setPodView('main');setTab(t.id);}} accessibilityRole="tab" accessibilityState={{selected:tab===t.id}}><View style={tab===t.id?styles.activeTabIcon:styles.inactiveTabIcon}><SmallIcon name={tab===t.id?t.active:t.icon} size={20} color={tab===t.id?C.green:C.muted}/></View><Text style={[styles.tabText,tab===t.id&&{color:C.green,fontWeight:'700'}]}>{t.name}</Text></Pressable>)}</View>
    <Modal visible={modal!==null} animationType="slide" transparent onRequestClose={()=>setModal(null)}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.modalBackdrop}><Pressable onPress={()=>setModal(null)} style={styles.modalCurtain}/><View style={styles.modalSheet}>
      <View style={styles.modalBar}/><View style={styles.modalTop}><Text style={styles.modalBrand}>pea.</Text><Pressable onPress={()=>setModal(null)} style={styles.close}><SmallIcon name="close"/></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:35}} showsVerticalScrollIndicator={false}>
        {modal==='treat'?treatModal():modal==='task'?taskModal():modal==='event'?eventModal():modal==='recipe'?recipeModal():modal==='grocery'?<><Text style={styles.modalTitle}>Add to your grocery list</Text><TextInput style={styles.input} placeholder="What do you need?" placeholderTextColor={C.muted} value={newTitle} onChangeText={setNewTitle} autoFocus returnKeyType="done" onSubmitEditing={addGrocery}/><Action title="Add ingredient" onPress={addGrocery} icon="add"/></>:modal==='reminder'?reminderModal():modal==='template'?<><Text style={styles.modalTitle}>{workTemplates[selectedTemplate].title}</Text><Text style={styles.modalSub}>Sample wording; verify and customize before using in authorized university systems.</Text><View style={styles.template}><Text selectable style={styles.templateText}>{workTemplates[selectedTemplate].body}</Text></View><Action title="Share draft" icon="share-outline" variant="outline" onPress={shareTemplate} style={{marginTop:12}}/><Text style={styles.tipText}>Review the draft before using it in BU-approved systems. Do not put student details in Pea.</Text></>:null}
      </ScrollView>
    </View></KeyboardAvoidingView></Modal>
  </SafeAreaView></SafeAreaProvider>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  topBar:{height:69,paddingHorizontal:22,flexDirection:'row',alignItems:'center',borderBottomColor:C.line,borderBottomWidth:1,backgroundColor:C.bg},
  brand:{flexDirection:'row',alignItems:'center',gap:6},brandImage:{width:37,height:37,borderRadius:12},brandText:{fontSize:32,fontFamily:Platform.OS==='ios'?'Georgia':'serif',color:C.text,letterSpacing:-1.4},
  topTag:{fontSize:11,color:C.muted,flex:1,textAlign:'right',marginRight:13},avatar:{height:34,width:34,borderRadius:17,backgroundColor:C.greenSoft,alignItems:'center',justifyContent:'center'},
  scrollContent:{paddingHorizontal:20,paddingTop:20,paddingBottom:40},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:14},
  hero:{minHeight:130,flexDirection:'row',alignItems:'center',paddingHorizontal:4,marginBottom:22},
  eyebrow:{fontSize:10,color:C.green,fontWeight:'800',letterSpacing:2,marginBottom:12},
  greeting:{fontSize:32,lineHeight:40,color:C.text,fontFamily:Platform.OS==='ios'?'Georgia':'serif'},
  heroSub:{fontSize:13,color:C.muted,lineHeight:20,marginTop:7,maxWidth:240},heroPea:{height:94,width:94,borderRadius:30},
  headingRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:8},
  heading:{fontSize:22,lineHeight:27,color:C.text,fontFamily:Platform.OS==='ios'?'Georgia':'serif'},
  subheading:{fontSize:12.5,color:C.muted,marginTop:5,lineHeight:18},
  twoTiles:{flexDirection:'row',gap:11},tile:{flex:1,padding:17,borderRadius:22,minHeight:154,alignItems:'flex-start',gap:6},
  tileIcon:{height:38,width:38,backgroundColor:C.white,borderRadius:13,alignItems:'center',justifyContent:'center',marginBottom:3},
  tileTitle:{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:21,color:C.text},tileSub:{fontSize:12,color:C.muted,marginBottom:5},
  card:{padding:16,borderRadius:22,backgroundColor:C.white,borderWidth:1,borderColor:C.line,...shadow},
  cardTitle:{fontSize:15,fontWeight:'700',color:C.text,lineHeight:21},body:{fontSize:13.5,color:C.muted,lineHeight:20,marginTop:5},
  tinyLabel:{fontSize:10,fontWeight:'800',color:C.green,letterSpacing:1.1,marginBottom:8},
  taskRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12,minHeight:44},taskTitle:{fontSize:14,color:C.text,fontWeight:'500',lineHeight:20},
  strike:{textDecorationLine:'line-through',color:C.muted},meta:{fontSize:12,color:C.muted,lineHeight:18,marginTop:3},separator:{height:1,backgroundColor:C.line,marginVertical:5},
  empty:{flexDirection:'row',alignItems:'center',gap:10},link:{color:C.green,fontWeight:'700',fontSize:13},
  action:{flexDirection:'row',alignItems:'center',justifyContent:'center',paddingHorizontal:14,paddingVertical:11,borderRadius:99,gap:6},
  actionText:{fontSize:12,fontWeight:'700'},smallRound:{height:38,width:38,borderRadius:18,backgroundColor:C.greenSoft,justifyContent:'center',alignItems:'center'},
  mealHeadline:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6},mealName:{fontSize:20,color:C.text,fontFamily:Platform.OS==='ios'?'Georgia':'serif',marginBottom:2},
  mealActions:{flexDirection:'row',gap:8,marginTop:16,flexWrap:'wrap'},
  warmFooter:{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontStyle:'italic',color:C.pink,fontSize:16,textAlign:'center',marginTop:27,marginBottom:12},
  dayStrip:{flexDirection:'row',justifyContent:'space-between',gap:7,marginBottom:15},dayChip:{flex:1,alignItems:'center',borderRadius:14,borderWidth:1,borderColor:C.line,backgroundColor:C.white,paddingVertical:10},
  dayWeekday:{fontSize:11,color:C.muted,marginBottom:4},dayNum:{fontSize:16,color:C.text,fontWeight:'700'},
  inline:{flexDirection:'row',alignItems:'center',gap:12},groupHead:{flexDirection:'row',alignItems:'center',gap:7,marginVertical:8},groupTitle:{fontSize:14,fontWeight:'700',color:C.text},
  miniRoutine:{flex:1,minHeight:144,justifyContent:'center',gap:8},groceryRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10},
  progressCard:{backgroundColor:C.greenSoft,borderRadius:22,padding:15,flexDirection:'row',alignItems:'center',gap:12},
  progressRing:{height:65,width:65,borderRadius:33,borderWidth:5,borderColor:C.greenMid,alignItems:'center',justifyContent:'center',backgroundColor:C.white},
  progressText:{fontWeight:'800',color:C.green,fontSize:14},
  weekStrip:{flexDirection:'row',gap:4,marginBottom:4},weekDay:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:C.white,borderRadius:14,paddingVertical:10,gap:3},
  weekDayActive:{backgroundColor:C.green},weekDayName:{fontSize:10,color:C.muted},weekDayNum:{fontSize:15,fontWeight:'700',color:C.text},eventDot:{height:5,width:5,borderRadius:3},
  recipeHero:{flexDirection:'row',gap:14,alignItems:'center',backgroundColor:C.pinkSoft,padding:15,borderRadius:18,marginBottom:21},
  stepNumber:{height:24,width:24,borderRadius:12,backgroundColor:C.green,alignItems:'center',justifyContent:'center'},
  calendarTime:{paddingHorizontal:9,paddingVertical:9,borderRadius:10,backgroundColor:C.greenSoft},
  textButton:{alignSelf:'center',marginTop:21,marginBottom:7,padding:8},tipText:{fontSize:12,color:C.muted,lineHeight:18,marginTop:15,marginBottom:12},
  linkIcon:{height:41,width:41,borderRadius:14,backgroundColor:C.greenSoft,alignItems:'center',justifyContent:'center'},
  bottomTabs:{height:74,flexDirection:'row',backgroundColor:C.white,borderTopColor:C.line,borderTopWidth:1,paddingTop:7},
  tab:{flex:1,alignItems:'center',justifyContent:'center'},activeTabIcon:{width:40,height:33,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:C.greenSoft},inactiveTabIcon:{width:40,height:33,alignItems:'center',justifyContent:'center'},
  tabText:{fontSize:10,color:C.muted,marginTop:2},
  modalBackdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(33,43,34,.36)'},modalCurtain:{flex:1},
  modalSheet:{maxHeight:'84%',backgroundColor:C.bg,borderTopLeftRadius:30,borderTopRightRadius:30,paddingHorizontal:23,paddingTop:8},
  modalBar:{width:44,height:5,borderRadius:9,backgroundColor:C.pinkMid,alignSelf:'center',marginBottom:10},modalTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:15},
  modalBrand:{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:24,color:C.green},close:{height:32,width:32,borderRadius:16,backgroundColor:C.greenSoft,alignItems:'center',justifyContent:'center'},
  modalTitle:{fontSize:25,fontFamily:Platform.OS==='ios'?'Georgia':'serif',color:C.text,marginBottom:7},modalSub:{fontSize:13.5,color:C.muted,lineHeight:21,marginBottom:16},
  input:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:15,padding:15,color:C.text,fontSize:15,marginTop:8,marginBottom:18},
  choiceRow:{flexDirection:'row',gap:8,marginBottom:16},choice:{paddingHorizontal:15,paddingVertical:11,borderRadius:99,borderWidth:1},choiceText:{color:C.text,fontWeight:'600',fontSize:13},
  privacyCallout:{padding:13,borderRadius:15,backgroundColor:C.greenSoft,flexDirection:'row',gap:11,alignItems:'flex-start',marginBottom:15},
  timeRow:{flexDirection:'row',alignItems:'center',gap:8},timeInput:{width:65,textAlign:'center',fontSize:18},timeColon:{fontSize:22,color:C.text,marginBottom:9},
  meTimeHero:{padding:15,backgroundColor:C.pinkSoft,borderRadius:22,flexDirection:'row',alignItems:'center',gap:12},
  backLink:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:18,paddingVertical:5},
  happyGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},
  happyTile:{width:'48%',borderRadius:19,padding:14,minHeight:105,gap:3},
  happyTileTitle:{fontSize:14,fontWeight:'700',color:C.text,marginTop:3},
  interestChip:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:13,paddingVertical:11,borderRadius:99,backgroundColor:C.white,borderWidth:1,borderColor:C.line},
  interestChipText:{fontSize:12,fontWeight:'700',color:C.text},
  statusChip:{paddingHorizontal:10,paddingVertical:8,borderRadius:99,backgroundColor:C.greenSoft,maxWidth:120},
  template:{padding:17,backgroundColor:C.white,borderRadius:18,borderWidth:1,borderColor:C.line},templateText:{fontSize:14,color:C.text,lineHeight:23},
});

export default Main;
