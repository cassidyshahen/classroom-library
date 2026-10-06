const SUPABASE_URL="https://wwkcacypzjoojonmfaui.supabase.co";

const SUPABASE_ANON_KEY="sb_publishable_6sl4TXTKcrE7vPG-BcEh3A_GfkmnCkM";

const supabaseClient=supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


const LOGIN_DURATION=8*60*60*1000;

const LOGIN_TIME_KEY="classroomLibraryLoginTime";


let books=[];
let students=[];
let classes=[];
let checkouts=[];


let selectedStudentClass="7S";

let currentStudentHistoryStudentId=null;

let editingCheckoutId=null;

let selectedBookId="";

let editingBookId=null;

let selectedExistingBookId=null;


/* ============================================================
   DATE FUNCTIONS
============================================================ */

function getTodayEastern(){

  const now=new Date();

  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/New_York",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(now);

  let year="";
  let month="";
  let day="";

  parts.forEach(part=>{

    if(part.type==="year")year=part.value;

    if(part.type==="month")month=part.value;

    if(part.type==="day")day=part.value;

  });

  return `${year}-${month}-${day}`;

}


function formatDate(value){

  if(!value)return "";

  const dateString=String(value).substring(0,10);

  const parts=dateString.split("-");

  if(parts.length!==3)return value;

  const year=Number(parts[0]);
  const month=Number(parts[1]);
  const day=Number(parts[2]);

  if(!year||!month||!day)return value;

  return new Intl.DateTimeFormat("en-US",{
    month:"long",
    day:"numeric",
    year:"numeric"
  }).format(
    new Date(year,month-1,day)
  );

}


/* ============================================================
   HELPER FUNCTIONS
============================================================ */

function getClassName(classId){

  const found=classes.find(
    c=>String(c.id)===String(classId)
  );

  if(!found)return "";

  return found.name||
    found.Name||
    found.class_name||
    found["Class Name"]||
    "";

}


function getBookTitle(bookId){

  const book=books.find(
    b=>String(b.id)===String(bookId)
  );

  return book?book.Title:"Unknown Book";

}


function getStudent(studentId){

  return students.find(
    s=>String(s.id)===String(studentId)
  );

}


function getAvailableCopies(book){

  const activeCheckouts=
    checkouts.filter(c=>
      String(c.book_id)===String(book.id)&&
      !c["Return Date"]
    ).length;

  return Math.max(
    0,
    Number(book.Copies||0)-activeCheckouts
  );

}


function getActiveCheckoutCount(bookId){

  return checkouts.filter(c=>
    String(c.book_id)===String(bookId)&&
    !c["Return Date"]
  ).length;

}


function showMessage(elementId,message,type){

  const element=document.getElementById(elementId);

  if(!element)return;

  element.innerHTML=
    `<div class="message ${type}">${message}</div>`;

  setTimeout(()=>{
    element.innerHTML="";
  },4000);

}


/* ============================================================
   SMART BOOK MATCHING
============================================================ */

function normalizeBookText(value){

  return String(value||"")
    .toLowerCase()
    .replace(/['’]/g,"")
    .replace(/&/g," and ")
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\s+/g," ")
    .trim();

}


function getBookWords(value){

  const ignoredWords=new Set([
    "the",
    "a",
    "an",
    "and",
    "of",
    "in",
    "on",
    "to",
    "for",
    "book",
    "novel"
  ]);

  return new Set(
    normalizeBookText(value)
      .split(" ")
      .filter(
        word=>
          word&&
          !ignoredWords.has(word)
      )
  );

}


function stringSimilarity(first,second){

  const a=normalizeBookText(first);
  const b=normalizeBookText(second);

  if(!a&&!b)return 1;
  if(!a||!b)return 0;
  if(a===b)return 1;

  const rows=a.length+1;
  const columns=b.length+1;

  const matrix=[];

  for(let i=0;i<rows;i++){

    matrix[i]=
      new Array(columns).fill(0);

    matrix[i][0]=i;

  }

  for(let j=0;j<columns;j++){

    matrix[0][j]=j;

  }

  for(let i=1;i<rows;i++){

    for(let j=1;j<columns;j++){

      const cost=
        a[i-1]===b[j-1]
          ? 0
          : 1;

      matrix[i][j]=Math.min(
        matrix[i-1][j]+1,
        matrix[i][j-1]+1,
        matrix[i-1][j-1]+cost
      );

    }

  }

  const distance=
    matrix[rows-1][columns-1];

  return 1-
    distance/
    Math.max(
      a.length,
      b.length
    );

}


function titleSimilarity(first,second){

  const firstText=
    normalizeBookText(first);

  const secondText=
    normalizeBookText(second);

  if(!firstText||!secondText)
    return 0;

  if(firstText===secondText)
    return 1;

  if(
    firstText.includes(secondText)||
    secondText.includes(firstText)
  ){

    const shorter=
      Math.min(
        firstText.length,
        secondText.length
      );

    const longer=
      Math.max(
        firstText.length,
        secondText.length
      );

    return .82+
      .18*(shorter/longer);

  }

  const firstWords=
    getBookWords(first);

  const secondWords=
    getBookWords(second);

  if(
    firstWords.size===0||
    secondWords.size===0
  ){

    return stringSimilarity(
      first,
      second
    );

  }

  let matchingWords=0;

  firstWords.forEach(word=>{

    if(secondWords.has(word)){

      matchingWords++;

      return;

    }

    for(const otherWord of secondWords){

      if(
        word.length>=4&&
        otherWord.length>=4&&
        stringSimilarity(
          word,
          otherWord
        )>=.78
      ){

        matchingWords++;

        break;

      }

    }

  });

  const coverageOfEnteredTitle=
    matchingWords/
    firstWords.size;

  const coverageOfExistingTitle=
    matchingWords/
    secondWords.size;

  const wordScore=
    Math.max(
      coverageOfEnteredTitle,
      coverageOfExistingTitle*.85
    );

  const characterScore=
    stringSimilarity(
      first,
      second
    );

  return Math.max(
    wordScore*.75+
      characterScore*.25,
    wordScore
  );

}


function findTitleMatches(title){

  if(!title.trim())
    return [];

  const results=[];

  books.forEach(book=>{

    const existingTitle=
      String(book.Title||"");

    const titleScore=
      titleSimilarity(
        title,
        existingTitle
      );

    if(titleScore>=.48){

      results.push({
        book,
        titleScore
      });

    }

  });

  results.sort(
    (a,b)=>
      b.titleScore-a.titleScore
  );

  return results.slice(0,6);

}


function getMatchConfidence(score){

  if(score>=.88)
    return "Very likely";

  if(score>=.72)
    return "Likely";

  return "Possible";

}


/* ============================================================
   COVER IMAGE HELPERS
============================================================ */

function getBookCoverUrl(book){

  if(!book)return "";

  return String(
    book["Cover URL"]||
    book.CoverURL||
    book.cover_url||
    ""
  ).trim();

}


function getBookCoverHtml(book){

  const coverUrl=
    getBookCoverUrl(book);

  if(!coverUrl)
    return "";

  return `
    <img
      src="${coverUrl}"
      alt="${book.Title||"Book cover"}"
      class="book-cover-thumbnail"
      onerror="this.style.display='none'"
    >
  `;

}


/* ============================================================
   QUICK ADD BOOK
============================================================ */

function renderBookSearchResults(){

  const area=
    document.getElementById(
      "bookSearchResults"
    );

  const titleInput=
    document.getElementById(
      "bookTitleInput"
    );

  if(!area||!titleInput)
    return;

  const title=
    titleInput.value.trim();

  selectedExistingBookId=null;

  area.innerHTML="";

  if(!title)
    return;

  const matches=
    findTitleMatches(title);

  if(matches.length===0){

    const noResults=
      document.createElement("div");

    noResults.className=
      "book-search-no-results";

    noResults.textContent=
      "No existing book looks like this yet. If this is a new book, use “+ Add as New Book” below.";

    area.appendChild(
      noResults
    );

    return;

  }

  const label=
    document.createElement("div");

  label.className=
    "book-search-label";

  label.textContent=
    "Books already in your library:";

  area.appendChild(label);

  matches.forEach(match=>{

    const book=match.book;

    const button=
      document.createElement("button");

    button.type="button";

    button.className=
      "book-search-option";

    const titleDiv=
      document.createElement("div");

    titleDiv.className=
      "book-search-option-title";

    titleDiv.textContent=
      book.Title||"Untitled";

    const confidence=
      document.createElement("span");

    confidence.className=
      "match-confidence";

    confidence.textContent=
      getMatchConfidence(
        match.titleScore
      );

    titleDiv.appendChild(
      confidence
    );

    button.appendChild(
      titleDiv
    );

    const details=
      document.createElement("div");

    details.className=
      "book-search-option-details";

    let detailText=
      book.Author||
      "";

    if(book.Series){

      if(detailText)
        detailText+=" · ";

      detailText+=book.Series;

      if(
        book["Series #"]!==null&&
        book["Series #"]!==""
      ){

        detailText+=
          ` #${book["Series #"]}`;

      }

    }

    if(detailText)
      detailText+=" · ";

    detailText+=
      `${Number(book.Copies||0)} ${
        Number(book.Copies||0)===1
          ? "copy"
          : "copies"
      } in library`;

    details.textContent=
      detailText;

    button.appendChild(
      details
    );

    button.addEventListener(
      "click",
      ()=>{
        selectExistingBookForAdd(
          book.id
        );
      }
    );

    area.appendChild(
      button
    );

  });

}


function selectExistingBookForAdd(bookId){

  const book=
    books.find(
      b=>String(b.id)===String(bookId)
    );

  if(!book)
    return;

  selectedExistingBookId=
    book.id;

  document.getElementById(
    "bookTitleInput"
  ).value=
    book.Title||"";

  const area=
    document.getElementById(
      "bookSearchResults"
    );

  area.innerHTML="";

  const box=
    document.createElement("div");

  box.className=
    "selected-existing-book";

  const title=
    document.createElement("div");

  title.className=
    "selected-existing-book-title";

  title.textContent=
    book.Title||"Untitled";

  box.appendChild(title);

  const details=
    document.createElement("div");

  details.className=
    "selected-existing-book-details";

  let detailText=
    book.Author
      ? `Author: ${book.Author}`
      : "";

  if(book.Series){

    if(detailText)
      detailText+="<br>";

    detailText+=
      `Series: ${book.Series}`;

  }

  if(
    book["Series #"]!==null&&
    book["Series #"]!==""
  ){

    if(detailText)
      detailText+="<br>";

    detailText+=
      `Series #: ${book["Series #"]}`;

  }

  if(detailText)
    detailText+="<br>";

  detailText+=
    `You currently have ${Number(book.Copies||0)} ${
      Number(book.Copies||0)===1
        ? "copy"
        : "copies"
    } in your library.`;

  details.innerHTML=
    detailText;

  box.appendChild(details);

  const buttons=
    document.createElement("div");

  buttons.className=
    "selected-book-buttons";

  const addButton=
    document.createElement("button");

  addButton.type="button";

  addButton.className=
    "add-copies-button";

  addButton.textContent=
    "Add Copies to This Book";

  addButton.addEventListener(
    "click",
    addCopiesToSelectedBook
  );

  buttons.appendChild(
    addButton
  );

  const changeButton=
    document.createElement("button");

  changeButton.type="button";

  changeButton.className=
    "change-book-button";

  changeButton.textContent=
    "Choose a Different Book";

  changeButton.addEventListener(
    "click",
    ()=>{

      selectedExistingBookId=null;

      area.innerHTML="";

      renderBookSearchResults();

      document.getElementById(
        "bookTitleInput"
      ).focus();

    }
  );

  buttons.appendChild(
    changeButton
  );

  box.appendChild(
    buttons
  );

  area.appendChild(
    box
  );

}


async function addCopiesToSelectedBook(){

  if(!selectedExistingBookId)
    return;

  const book=
    books.find(
      b=>String(b.id)===
        String(selectedExistingBookId)
    );

  if(!book)
    return;

  const copies=
    Number(
      document.getElementById(
        "bookCopiesInput"
      ).value
    );

  if(
    !Number.isInteger(copies)||
    copies<1
  ){

    showBookModalMessage(
      "Copies must be a whole number of at least 1.",
      "error"
    );

    return;

  }

  const button=
    document.querySelector(
      ".add-copies-button"
    );

  if(button){

    button.disabled=true;

    button.textContent=
      "Adding Copies...";

  }

  try{

    const newCopies=
      Number(book.Copies||0)+
      copies;

    const {error}=
      await supabaseClient
        .from("Books")
        .update({
          "Copies":newCopies
        })
        .eq(
          "id",
          book.id
        );

    if(error)
      throw error;

    closeBookModal();

    await loadData();

  }catch(error){

    console.error(
      "Add copies error:",
      error
    );

    showBookModalMessage(
      "Could not add the copies. Please try again.",
      "error"
    );

    if(button){

      button.disabled=false;

      button.textContent=
        "Add Copies to This Book";

    }

  }

}


/* ============================================================
   BOOK MODAL
============================================================ */

function resetBookModal(){

  editingBookId=null;

  selectedExistingBookId=null;

  const editTitleGroup=
    document.getElementById(
      "editBookTitleGroup"
    );

  if(editTitleGroup)
    editTitleGroup.classList.add(
      "hidden"
    );

  const editTitleInput=
    document.getElementById(
      "editBookTitleInput"
    );

  if(editTitleInput)
    editTitleInput.value="";

  const titleInput=
    document.getElementById(
      "bookTitleInput"
    );

  if(titleInput)
    titleInput.value="";

  document.getElementById(
    "newBookAuthorInput"
  ).value="";

  document.getElementById(
    "newBookCategoryInput"
  ).value="";

  document.getElementById(
    "newBookSeriesInput"
  ).value="";

  document.getElementById(
    "newBookSeriesNumberInput"
  ).value="";

  document.getElementById(
    "bookCopiesInput"
  ).value=1;

  const coverInput=
    document.getElementById(
      "newBookCoverInput"
    );

  if(coverInput)
    coverInput.value="";

  document.getElementById(
    "bookSearchResults"
  ).innerHTML="";

  document.getElementById(
    "bookModalMessage"
  ).innerHTML="";

  document.getElementById(
    "quickAddSection"
  ).classList.remove(
    "hidden"
  );

  document.getElementById(
    "newBookDetailsSection"
  ).classList.add(
    "hidden"
  );

  document.getElementById(
    "backToBookSearchButton"
  ).classList.remove(
    "hidden"
  );

  document.getElementById(
    "bookModalTitle"
  ).textContent=
    "Add Book";

  document.getElementById(
    "saveNewBookButton"
  ).textContent=
    "Add New Book";

  updateNewBookCategoryFields();

}


function openAddBook(){

  resetBookModal();

  document.getElementById(
    "bookModal"
  ).classList.remove(
    "hidden"
  );

  document.getElementById(
    "bookTitleInput"
  ).focus();

}


function closeBookModal(){

  document.getElementById(
    "bookModal"
  ).classList.add(
    "hidden"
  );

  resetBookModal();

}


function showBookModalMessage(message,type){

  const element=
    document.getElementById(
      "bookModalMessage"
    );

  if(!element)
    return;

  element.innerHTML=
    `<div class="message ${type}">${message}</div>`;

}


/* ============================================================
   NEW BOOK FORM
============================================================ */

function showNewBookForm(){

  const title=
    document.getElementById(
      "bookTitleInput"
    ).value.trim();

  const copies=
    Number(
      document.getElementById(
        "bookCopiesInput"
      ).value
    );

  if(!title){

    showBookModalMessage(
      "Please enter a book title first.",
      "error"
    );

    document.getElementById(
      "bookTitleInput"
    ).focus();

    return;

  }

  if(
    !Number.isInteger(copies)||
    copies<1
  ){

    showBookModalMessage(
      "Copies must be a whole number of at least 1.",
      "error"
    );

    return;

  }

  selectedExistingBookId=null;

  document.getElementById(
    "quickAddSection"
  ).classList.add(
    "hidden"
  );

  document.getElementById(
    "newBookDetailsSection"
  ).classList.remove(
    "hidden"
  );

  document.getElementById(
    "bookModalTitle"
  ).textContent=
    "Add New Book";

  const editTitleGroup=
    document.getElementById(
      "editBookTitleGroup"
    );

  if(editTitleGroup)
    editTitleGroup.classList.add(
      "hidden"
    );

  document.getElementById(
    "newBookAuthorInput"
  ).focus();

}


function returnToBookSearch(){

  document.getElementById(
    "newBookDetailsSection"
  ).classList.add(
    "hidden"
  );

  document.getElementById(
    "quickAddSection"
  ).classList.remove(
    "hidden"
  );

  document.getElementById(
    "bookModalTitle"
  ).textContent=
    "Add Book";

  document.getElementById(
    "bookModalMessage"
  ).innerHTML="";

  document.getElementById(
    "backToBookSearchButton"
  ).classList.remove(
    "hidden"
  );

  const editTitleGroup=
    document.getElementById(
      "editBookTitleGroup"
    );

  if(editTitleGroup)
    editTitleGroup.classList.add(
      "hidden"
    );

  renderBookSearchResults();

  document.getElementById(
    "bookTitleInput"
  ).focus();

}


function updateNewBookCategoryFields(){

  const category=
    document.getElementById(
      "newBookCategoryInput"
    ).value;

  const seriesGroup=
    document.getElementById(
      "newBookSeriesGroup"
    );

  const numberGroup=
    document.getElementById(
      "newBookSeriesNumberGroup"
    );

  if(!seriesGroup||!numberGroup)
    return;

  if(category==="Series"){

    seriesGroup.classList.remove(
      "hidden"
    );

    numberGroup.classList.remove(
      "hidden"
    );

  }else{

    seriesGroup.classList.add(
      "hidden"
    );

    numberGroup.classList.add(
      "hidden"
    );

    if(category==="Standalone"){

      document.getElementById(
        "newBookSeriesInput"
      ).value="";

      document.getElementById(
        "newBookSeriesNumberInput"
      ).value="";

    }

  }

}


/* ============================================================
   SERIES OPTIONS
============================================================ */

function updateSeriesOptions(){

  const seriesSelect=
    document.getElementById(
      "seriesFilter"
    );

  if(!seriesSelect)
    return;

}


/* ============================================================
   COLLECT NEW BOOK DATA
============================================================ */

function collectNewBookData(){

  const title=
    document.getElementById(
      "bookTitleInput"
    ).value.trim();

  const copies=
    Number(
      document.getElementById(
        "bookCopiesInput"
      ).value
    );

  const author=
    document.getElementById(
      "newBookAuthorInput"
    ).value.trim();

  const category=
    document.getElementById(
      "newBookCategoryInput"
    ).value;

  const series=
    document.getElementById(
      "newBookSeriesInput"
    ).value.trim();

  const seriesNumberValue=
    document.getElementById(
      "newBookSeriesNumberInput"
    ).value;

  const coverInput=
    document.getElementById(
      "newBookCoverInput"
    );

  const coverUrl=
    coverInput
      ? coverInput.value.trim()
      : "";

  if(!title){

    showBookModalMessage(
      "Please enter a book title.",
      "error"
    );

    return null;

  }

  if(
    !Number.isInteger(copies)||
    copies<1
  ){

    showBookModalMessage(
      "Copies must be a whole number of at least 1.",
      "error"
    );

    return null;

  }

  if(!author){

    showBookModalMessage(
      "Please enter the author.",
      "error"
    );

    return null;

  }

  if(!category){

    showBookModalMessage(
      "Please select Series or Standalone.",
      "error"
    );

    return null;

  }

  if(category==="Series"&&!series){

    showBookModalMessage(
      "Please enter the series name.",
      "error"
    );

    return null;

  }

  let seriesNumber=null;

  if(category==="Series"){

    seriesNumber=
      seriesNumberValue
        ? Number(seriesNumberValue)
        : null;

    if(
      seriesNumber!==null&&
      (
        !Number.isInteger(seriesNumber)||
        seriesNumber<1
      )
    ){

      showBookModalMessage(
        "Series number must be a positive whole number.",
        "error"
      );

      return null;

    }

  }

  return {
    title,
    author,
    category,
    series,
    seriesNumber,
    copies,
    coverUrl
  };

}


/* ============================================================
   SAVE NEW BOOK
============================================================ */

async function saveNewBook(){

  const data=
    collectNewBookData();

  if(!data)
    return;

  const button=
    document.getElementById(
      "saveNewBookButton"
    );

  button.disabled=true;

  button.textContent=
    "Checking Library...";

  try{

    const exactMatch=
      books.find(book=>

        normalizeBookText(book.Title)===
          normalizeBookText(data.title)&&

        normalizeBookText(book.Author)===
          normalizeBookText(data.author)&&

        normalizeBookText(book.Category)===
          normalizeBookText(data.category)&&

        normalizeBookText(book.Series||"")===
          normalizeBookText(
            data.category==="Series"
              ? data.series
              : ""
          )&&

        String(book["Series #"]||"")===
          String(data.seriesNumber||"")

      );

    if(exactMatch){

      const confirmed=
        confirm(
          `"${exactMatch.Title}" is already in your library.\n\nWould you like to add ${data.copies} more ${
            data.copies===1
              ? "copy"
              : "copies"
          } to that existing book instead?`
        );

      if(confirmed){

        const newCopies=
          Number(exactMatch.Copies||0)+
          data.copies;

        const updateData={
          "Copies":newCopies
        };

        if(data.coverUrl){

          updateData["Cover URL"]=
            data.coverUrl;

        }

        const {error}=
          await supabaseClient
            .from("Books")
            .update(updateData)
            .eq(
              "id",
              exactMatch.id
            );

        if(error)
          throw error;

        closeBookModal();

        await loadData();

        return;

      }

    }

    await insertNewBook(data);

  }catch(error){

    console.error(
      "Save new book error:",
      error
    );

    console.error(
      "Supabase error details:",
      error.message,
      error.details,
      error.hint
    );

    showBookModalMessage(
      "Could not save the book. Please try again.",
      "error"
    );

  }finally{

    button.disabled=false;

    button.textContent=
      "Add New Book";

  }

}


/* ============================================================
   INSERT NEW BOOK
============================================================ */

async function insertNewBook(data){

  const button=
    document.getElementById(
      "saveNewBookButton"
    );

  if(button){

    button.disabled=true;

    button.textContent=
      "Adding...";

  }

  try{

    const bookData={

      "Title":data.title,

      "Author":data.author,

      "Category":data.category,

      "Series":
        data.category==="Series"
          ? data.series
          : null,

      "Series #":
        data.category==="Series"
          ? data.seriesNumber
          : null,

      "Copies":data.copies,

      "Cover URL":
        data.coverUrl||null

    };

    const {error}=
      await supabaseClient
        .from("Books")
        .insert(bookData);

    if(error)
      throw error;

    closeBookModal();

    await loadData();

  }catch(error){

    console.error(
      "Insert new book error:",
      error
    );

    console.error(
      "Supabase error details:",
      error.message,
      error.details,
      error.hint
    );

    showBookModalMessage(
      "Could not save the book. Please make sure the Books permissions and Cover URL column are set up correctly in Supabase.",
      "error"
    );

  }finally{

    if(button){

      button.disabled=false;

      button.textContent=
        "Add New Book";

    }

  }

}


/* ============================================================
   LOAD DATA
============================================================ */

async function loadData(){

  try{

    const [
      booksResult,
      studentsResult,
      classesResult,
      checkoutsResult
    ]=await Promise.all([

      supabaseClient
        .from("Books")
        .select("*")
        .order("Title"),

      supabaseClient
        .from("Students")
        .select("*")
        .order("class_id")
        .order("student_number"),

      supabaseClient
        .from("Classes")
        .select("*")
        .order("id"),

      supabaseClient
        .from("Checkouts")
        .select("*")
        .order(
          "Check Out Date",
          {ascending:false}
        )

    ]);

    if(booksResult.error)
      throw booksResult.error;

    if(studentsResult.error)
      throw studentsResult.error;

    if(classesResult.error)
      throw classesResult.error;

    if(checkoutsResult.error)
      throw checkoutsResult.error;

    books=booksResult.data||[];

    students=studentsResult.data||[];

    classes=classesResult.data||[];

    checkouts=checkoutsResult.data||[];

    updateDashboard();

    populateClasses();

    renderLibrary();

    renderStudents();

    renderCheckedOut();

    renderHistory();

    updateSeriesOptions();

  }catch(error){

    console.error(
      "Error loading data:",
      error
    );

    alert(
      "There was a problem loading your library data. Please refresh the page and try again."
    );

  }

}


/* ============================================================
   DASHBOARD
============================================================ */

function updateDashboard(){

  const totalBooks=
    books.reduce(
      (total,book)=>
        total+
        Number(book.Copies||0),
      0
    );

  const checkedOut=
    checkouts.filter(
      c=>!c["Return Date"]
    ).length;

  const available=
    Math.max(
      0,
      totalBooks-checkedOut
    );

  document.getElementById(
    "totalBooks"
  ).textContent=
    totalBooks;

  document.getElementById(
    "availableBooks"
  ).textContent=
    available;

  document.getElementById(
    "checkedOutBooks"
  ).textContent=
    checkedOut;

  document.getElementById(
    "totalStudents"
  ).textContent=
    students.length;

}


/* ============================================================
   CHECKOUT
============================================================ */

function populateClasses(){

  const select=
    document.getElementById(
      "classSelect"
    );

  select.innerHTML=
    '<option value="">Select a class...</option>';

  classes.forEach(classItem=>{

    const option=
      document.createElement(
        "option"
      );

    option.value=
      classItem.id;

    option.textContent=
      getClassName(
        classItem.id
      );

    select.appendChild(
      option
    );

  });

}


function populateStudents(){

  const classId=
    document.getElementById(
      "classSelect"
    ).value;

  const studentSelect=
    document.getElementById(
      "studentSelect"
    );

  studentSelect.innerHTML=
    '<option value="">Select a student...</option>';

  if(!classId){

    studentSelect.disabled=true;

    clearBookSelection();

    document.getElementById(
      "bookSelect"
    ).disabled=true;

    return;

  }

  const classStudents=
    students.filter(
      student=>
        String(student.class_id)===
        String(classId)
    );

  classStudents.forEach(student=>{

    const option=
      document.createElement(
        "option"
      );

    option.value=
      student.id;

    option.textContent=
      `Student #${student.student_number}`;

    studentSelect.appendChild(
      option
    );

  });

  studentSelect.disabled=false;

  document.getElementById(
    "bookSelect"
  ).disabled=false;

  populateBooks();

}


function getFilteredBooks(){

  const search=
    document.getElementById(
      "bookSelect"
    ).value
      .toLowerCase()
      .trim();

  return books.filter(book=>{

    if(getAvailableCopies(book)<=0)
      return false;

    if(!search)
      return true;

    const title=
      String(book.Title||"")
        .toLowerCase();

    const author=
      String(book.Author||"")
        .toLowerCase();

    const series=
      String(book.Series||"")
        .toLowerCase();

    return title.includes(search)||
      author.includes(search)||
      series.includes(search);

  });

}


function populateBooks(){

  const input=
    document.getElementById(
      "bookSelect"
    );

  const list=
    document.getElementById(
      "bookDropdownList"
    );

  if(!input||!list)
    return;

  const availableBooks=
    getFilteredBooks();

  list.innerHTML="";

  if(availableBooks.length===0){

    list.innerHTML=
      '<div class="book-dropdown-empty">No available books found.</div>';

    return;

  }

  availableBooks.forEach(book=>{

    const option=
      document.createElement("div");

    option.className=
      "book-dropdown-option";

    let text=
      book.Title;

    if(book.Author)
      text+=` — ${book.Author}`;

    text+=
      ` (${getAvailableCopies(book)} available)`;

    option.textContent=
      text;

    option.addEventListener(
      "click",
      ()=>{

        selectedBookId=
          book.id;

        input.value=
          text;

        list.classList.add(
          "hidden"
        );

        updateCheckoutButton();

      }
    );

    list.appendChild(
      option
    );

  });

}


function clearBookSelection(){

  selectedBookId="";

  document.getElementById(
    "bookSelect"
  ).value="";

  document.getElementById(
    "bookDropdownList"
  ).classList.add(
    "hidden"
  );

  updateCheckoutButton();

}


function updateCheckoutButton(){

  const classValue=
    document.getElementById(
      "classSelect"
    ).value;

  const studentValue=
    document.getElementById(
      "studentSelect"
    ).value;

  const bookValue=
    selectedBookId;

  document.getElementById(
    "checkoutButton"
  ).disabled=
    !classValue||
    !studentValue||
    !bookValue;

}


async function checkoutBook(){

  const studentId=
    document.getElementById(
      "studentSelect"
    ).value;

  const bookId=
    selectedBookId;

  if(!studentId||!bookId)
    return;

  const book=
    books.find(
      b=>String(b.id)===
        String(bookId)
    );

  if(!book)
    return;

  if(getAvailableCopies(book)<=0){

    showMessage(
      "checkoutMessage",
      "That book is no longer available.",
      "error"
    );

    return;

  }

  const button=
    document.getElementById(
      "checkoutButton"
    );

  button.disabled=true;

  button.textContent=
    "Checking Out...";

  try{

    const today=
      getTodayEastern();

    const {error}=
      await supabaseClient
        .from("Checkouts")
        .insert({

          "Check Out Date":
            `${today}T12:00:00`,

          "Return Date":null,

          student_id:
            Number(studentId),

          book_id:
            Number(bookId)

        });

    if(error)
      throw error;

    showMessage(
      "checkoutMessage",
      "Book successfully checked out!",
      "success"
    );

    document.getElementById(
      "classSelect"
    ).value="";

    document.getElementById(
      "studentSelect"
    ).innerHTML=
      '<option value="">Select a student...</option>';

    document.getElementById(
      "studentSelect"
    ).disabled=true;

    clearBookSelection();

    document.getElementById(
      "bookSelect"
    ).disabled=true;

    await loadData();

  }catch(error){

    console.error(
      "Checkout error:",
      error
    );

    showMessage(
      "checkoutMessage",
      "Could not check out the book. Please try again.",
      "error"
    );

  }finally{

    button.textContent=
      "Check Out";

    updateCheckoutButton();

  }

}


async function returnBook(checkoutId){

  if(!confirm(
    "Are you sure you want to mark this book as returned?"
  ))
    return;

  try{

    const today=
      getTodayEastern();

    const {error}=
      await supabaseClient
        .from("Checkouts")
        .update({

          "Return Date":
            `${today}T12:00:00`

        })
        .eq(
          "id",
          checkoutId
        );

    if(error)
      throw error;

    await loadData();

  }catch(error){

    console.error(
      "Return error:",
      error
    );

    alert(
      "Could not return the book. Please try again."
    );

  }

}


/* ============================================================
   LIBRARY
============================================================ */

function renderLibrary(){

  const tbody=
    document.getElementById(
      "libraryTableBody"
    );

  if(!tbody)
    return;

  const search=
    document.getElementById(
      "librarySearch"
    ).value
      .toLowerCase()
      .trim();

  const filteredBooks=
    books.filter(book=>{

      if(!search)
        return true;

      return String(book.Title||"")
        .toLowerCase()
        .includes(search)||

        String(book.Author||"")
          .toLowerCase()
          .includes(search)||

        String(book.Category||"")
          .toLowerCase()
          .includes(search)||

        String(book.Series||"")
          .toLowerCase()
          .includes(search);

    });

  tbody.innerHTML="";

  if(filteredBooks.length===0){

    tbody.innerHTML=
      '<tr><td colspan="9">No books found.</td></tr>';

    return;

  }

  filteredBooks.forEach(book=>{

    const row=
      document.createElement(
        "tr"
      );

    const available=
      getAvailableCopies(book);

    row.innerHTML=`

      <td>

        ${
          getBookCoverHtml(book)||
          '<div class="book-cover-placeholder">📚</div>'
        }

      </td>

      <td>
        ${book.Title||""}
      </td>

      <td>
        ${book.Author||""}
      </td>

      <td>
        ${book.Category||""}
      </td>

      <td>
        ${book.Series||""}
      </td>

      <td>
        ${book["Series #"]||""}
      </td>

      <td>
        ${book.Copies||0}
      </td>

      <td>

        <span class="${
          available>0
            ? "available-good"
            : "available-none"
        }">

          ${available}

        </span>

      </td>

      <td>

        <div class="book-action-buttons">

          <button
            class="edit-button"
            type="button"
          >
            Edit
          </button>

          <button
            class="delete-button"
            type="button"
          >
            Delete
          </button>

        </div>

      </td>

    `;

    const actionButtons=
      row.querySelectorAll(
        ".book-action-buttons button"
      );

    actionButtons[0].addEventListener(
      "click",
      event=>{

        event.stopPropagation();

        openEditBook(
          book.id
        );

      }
    );

    actionButtons[1].addEventListener(
      "click",
      event=>{

        event.stopPropagation();

        deleteBook(
          book.id
        );

      }
    );

    tbody.appendChild(
      row
    );

  });

}


/* ============================================================
   EDIT EXISTING BOOK
============================================================ */

function openEditBook(bookId){

  const book=
    books.find(
      b=>String(b.id)===
        String(bookId)
    );

  if(!book)
    return;

  editingBookId=
    book.id;

  selectedExistingBookId=
    null;

  const detailsSection=
    document.getElementById(
      "newBookDetailsSection"
    );

  document.getElementById(
    "bookModalTitle"
  ).textContent=
    "Edit Book";

  document.getElementById(
    "quickAddSection"
  ).classList.add(
    "hidden"
  );

  detailsSection.classList.remove(
    "hidden"
  );

  document.getElementById(
    "backToBookSearchButton"
  ).classList.add(
    "hidden"
  );

  const heading=
    detailsSection.querySelector(
      "h3"
    );

  if(heading)
    heading.textContent=
      "Edit Book Details";

  const description=
    detailsSection.querySelector(
      "p"
    );

  if(description)
    description.textContent=
      "Update the information for this book.";

  let editTitleGroup=
    document.getElementById(
      "editBookTitleGroup"
    );

  if(!editTitleGroup){

    editTitleGroup=
      document.createElement(
        "div"
      );

    editTitleGroup.id=
      "editBookTitleGroup";

    editTitleGroup.className=
      "form-group";

    editTitleGroup.innerHTML=`

      <label for="editBookTitleInput">
        Book Title
      </label>

      <input
        type="text"
        id="editBookTitleInput"
        placeholder="Book title"
      >

    `;

    if(heading){

      heading.insertAdjacentElement(
        "afterend",
        editTitleGroup
      );

    }else{

      detailsSection.prepend(
        editTitleGroup
      );

    }

  }

  editTitleGroup.classList.remove(
    "hidden"
  );

  document.getElementById(
    "editBookTitleInput"
  ).value=
    book.Title||"";

  document.getElementById(
    "newBookAuthorInput"
  ).value=
    book.Author||"";

  document.getElementById(
    "newBookCategoryInput"
  ).value=
    book.Category||"";

  document.getElementById(
    "newBookSeriesInput"
  ).value=
    book.Series||"";

  document.getElementById(
    "newBookSeriesNumberInput"
  ).value=
    book["Series #"]||"";

  document.getElementById(
    "bookCopiesInput"
  ).value=
    Number(book.Copies||1);

  const coverInput=
    document.getElementById(
      "newBookCoverInput"
    );

  if(coverInput){

    coverInput.value=
      getBookCoverUrl(book);

  }

  document.getElementById(
    "bookModalMessage"
  ).innerHTML="";

  updateNewBookCategoryFields();

  document.getElementById(
    "saveNewBookButton"
  ).textContent=
    "Save Changes";

  document.getElementById(
    "bookModal"
  ).classList.remove(
    "hidden"
  );

  document.getElementById(
    "editBookTitleInput"
  ).focus();

}


async function saveEditedBook(){

  if(!editingBookId)
    return;

  const titleInput=
    document.getElementById(
      "editBookTitleInput"
    );

  const title=
    titleInput
      ? titleInput.value.trim()
      : "";

  const author=
    document.getElementById(
      "newBookAuthorInput"
    ).value.trim();

  const category=
    document.getElementById(
      "newBookCategoryInput"
    ).value;

  const series=
    document.getElementById(
      "newBookSeriesInput"
    ).value.trim();

  const seriesNumberValue=
    document.getElementById(
      "newBookSeriesNumberInput"
    ).value;

  const copies=
    Number(
      document.getElementById(
        "bookCopiesInput"
      ).value
    );

  const coverInput=
    document.getElementById(
      "newBookCoverInput"
    );

  const coverUrl=
    coverInput
      ? coverInput.value.trim()
      : "";

  if(!title){

    showBookModalMessage(
      "Please enter a book title.",
      "error"
    );

    return;

  }

  if(!author){

    showBookModalMessage(
      "Please enter the author.",
      "error"
    );

    return;

  }

  if(!category){

    showBookModalMessage(
      "Please select Series or Standalone.",
      "error"
    );

    return;

  }

  if(
    category==="Series"&&
    !series
  ){

    showBookModalMessage(
      "Please enter the series name.",
      "error"
    );

    return;

  }

  if(
    !Number.isInteger(copies)||
    copies<1
  ){

    showBookModalMessage(
      "Copies must be a whole number of at least 1.",
      "error"
    );

    return;

  }

  let seriesNumber=null;

  if(category==="Series"){

    seriesNumber=
      seriesNumberValue
        ? Number(seriesNumberValue)
        : null;

    if(
      seriesNumber!==null&&
      (
        !Number.isInteger(seriesNumber)||
        seriesNumber<1
      )
    ){

      showBookModalMessage(
        "Series number must be a positive whole number.",
        "error"
      );

      return;

    }

  }

  const button=
    document.getElementById(
      "saveNewBookButton"
    );

  button.disabled=true;

  button.textContent=
    "Saving...";

  try{

    const existingBook=
      books.find(
        b=>String(b.id)===
          String(editingBookId)
      );

    if(!existingBook)
      throw new Error(
        "Book not found."
      );

    const activeCheckouts=
      getActiveCheckoutCount(
        editingBookId
      );

    if(copies<activeCheckouts){

      showBookModalMessage(
        `You currently have ${activeCheckouts} copy/copies checked out. Copies cannot be reduced below that number.`,
        "error"
      );

      return;

    }

    const duplicate=
      books.find(book=>

        String(book.id)!==
          String(editingBookId)&&

        normalizeBookText(
          book.Title
        )===
          normalizeBookText(
            title
          )&&

        normalizeBookText(
          book.Author
        )===
          normalizeBookText(
            author
          )&&

        normalizeBookText(
          book.Category
        )===
          normalizeBookText(
            category
          )&&

        normalizeBookText(
          book.Series||""
        )===
          normalizeBookText(
            category==="Series"
              ? series
              : ""
          )&&

        String(
          book["Series #"]||""
        )===
          String(
            seriesNumber||""
          )

      );

    if(duplicate){

      showBookModalMessage(
        "Another book already has the same title, author, category, series, and series number.",
        "error"
      );

      return;

    }

    const {error}=
      await supabaseClient
        .from("Books")
        .update({

          "Title":title,

          "Author":author,

          "Category":category,

          "Series":
            category==="Series"
              ? series
              : null,

          "Series #":
            category==="Series"
              ? seriesNumber
              : null,

          "Copies":copies,

          "Cover URL":
            coverUrl||null

        })
        .eq(
          "id",
          editingBookId
        );

    if(error)
      throw error;

    closeBookModal();

    await loadData();

  }catch(error){

    console.error(
      "Edit book error:",
      error
    );

    showBookModalMessage(
      "Could not save the book. Please try again.",
      "error"
    );

  }finally{

    button.disabled=false;

    button.textContent=
      "Save Changes";

  }

}


/* ============================================================
   DELETE BOOK
============================================================ */

async function deleteBook(bookId){

  const book=
    books.find(
      b=>String(b.id)===
        String(bookId)
    );

  if(!book)
    return;

  const historyCount=
    checkouts.filter(
      c=>String(c.book_id)===
        String(bookId)
    ).length;

  if(historyCount>0){

    alert(
      `"${book.Title}" cannot be deleted because it has checkout history.\n\nYou can edit the book or change its number of copies instead.`
    );

    return;

  }

  const confirmed=
    confirm(
      `Delete "${book.Title}" from your library?\n\nThis cannot be undone.`
    );

  if(!confirmed)
    return;

  try{

    const {error}=
      await supabaseClient
        .from("Books")
        .delete()
        .eq(
          "id",
          bookId
        );

    if(error)
      throw error;

    await loadData();

  }catch(error){

    console.error(
      "Delete book error:",
      error
    );

    alert(
      "Could not delete the book. Please try again."
    );

  }

}


/* ============================================================
   STUDENTS
============================================================ */

function renderStudents(){

  const tbody=
    document.getElementById(
      "studentsTableBody"
    );

  const search=
    document.getElementById(
      "studentSearch"
    ).value
      .toLowerCase()
      .trim();

  tbody.innerHTML="";

  const filteredStudents=
    students.filter(student=>{

      const className=
        getClassName(
          student.class_id
        );

      if(
        className.toLowerCase()!==
        selectedStudentClass.toLowerCase()
      )
        return false;

      const studentNumber=
        String(
          student.student_number
        );

      if(
        search&&
        !studentNumber.includes(
          search
        )
      )
        return false;

      return true;

    });

  if(filteredStudents.length===0){

    tbody.innerHTML=
      '<tr><td colspan="4">No students found.</td></tr>';

    return;

  }

  filteredStudents.forEach(student=>{

    const className=
      getClassName(
        student.class_id
      );

    /*
      Currently Checked Out:
      Only checkout records without a Return Date.

      Checked Out All Time:
      Every checkout record for this student,
      whether the book was returned or not.
    */

    const borrowed=
      checkouts.filter(checkout=>
        String(checkout.student_id)===
          String(student.id)&&
        !checkout["Return Date"]
      ).length;

    const allTime=
      checkouts.filter(checkout=>
        String(checkout.student_id)===
          String(student.id)
      ).length;

    const row=
      document.createElement(
        "tr"
      );

    row.classList.add(
      "clickable-row"
    );

    row.addEventListener(
      "click",
      ()=>showStudentHistory(
        student.id
      )
    );

    row.innerHTML=`

      <td>
        ${className}
      </td>

      <td>
        Student #${student.student_number}
      </td>

      <td>
        ${borrowed}
      </td>

      <td>
        ${allTime}
      </td>

    `;

    tbody.appendChild(
      row
    );

  });

  document.querySelectorAll(
    ".student-tab"
  ).forEach(tab=>{

    tab.classList.toggle(
      "active",
      tab.dataset.class.toLowerCase()===
        selectedStudentClass.toLowerCase()
    );

  });

}


/* ============================================================
   STUDENT HISTORY
============================================================ */

function showStudentHistory(studentId){

  const student=
    getStudent(
      studentId
    );

  if(!student)
    return;

  currentStudentHistoryStudentId=
    studentId;

  const className=
    getClassName(
      student.class_id
    );

  document.getElementById(
    "studentHistoryTitle"
  ).textContent=
    `Student #${student.student_number} — ${className}`;

  const tbody=
    document.getElementById(
      "studentHistoryTableBody"
    );

  tbody.innerHTML="";

  const studentCheckouts=
    checkouts.filter(
      checkout=>
        String(checkout.student_id)===
        String(studentId)
    );

  if(studentCheckouts.length===0){

    tbody.innerHTML=`

      <tr>

        <td colspan="5">
          This student has not checked out any books yet.
        </td>

      </tr>

    `;

  }else{

    studentCheckouts.forEach(
      checkout=>{

        const book=
          books.find(
            b=>String(b.id)===
              String(checkout.book_id)
          );

        const returned=
          Boolean(
            checkout["Return Date"]
          );

        const row=
          document.createElement(
            "tr"
          );

        row.innerHTML=`

          <td>
            ${book?book.Title:"Unknown Book"}
          </td>

          <td>
            ${formatDate(
              checkout["Check Out Date"]
            )}
          </td>

          <td>
            ${
              returned
                ? formatDate(
                    checkout["Return Date"]
                  )
                : "—"
            }
          </td>

          <td>

            ${
              returned
                ? '<span class="history-status-returned">Returned</span>'
                : '<span class="history-status-out">Checked Out</span>'
            }

          </td>

          <td>

            <div class="history-actions">

              <button
                class="edit-button"
                onclick="openEditCheckout(${checkout.id})"
              >
                Edit
              </button>

              <button
                class="delete-button"
                onclick="deleteCheckout(${checkout.id})"
              >
                Delete
              </button>

            </div>

          </td>

        `;

        tbody.appendChild(
          row
        );

      }
    );

  }

  showPage(
    "studentHistory"
  );

}


/* ============================================================
   EDIT CHECKOUT
============================================================ */

function openEditCheckout(checkoutId){

  const checkout=
    checkouts.find(
      c=>String(c.id)===
        String(checkoutId)
    );

  if(!checkout)
    return;

  editingCheckoutId=
    checkoutId;

  const book=
    getBookTitle(
      checkout.book_id
    );

  document.getElementById(
    "editBookName"
  ).textContent=
    book;

  document.getElementById(
    "editCheckoutDate"
  ).value=
    checkout["Check Out Date"]
      ? String(
          checkout["Check Out Date"]
        ).substring(0,10)
      : "";

  const returned=
    Boolean(
      checkout["Return Date"]
    );

  document.getElementById(
    "editStatus"
  ).value=
    returned
      ? "returned"
      : "out";

  document.getElementById(
    "editReturnDate"
  ).value=
    checkout["Return Date"]
      ? String(
          checkout["Return Date"]
        ).substring(0,10)
      : "";

  updateEditReturnDateVisibility();

  document.getElementById(
    "editModal"
  ).classList.remove(
    "hidden"
  );

}


function closeEditCheckout(){

  editingCheckoutId=null;

  document.getElementById(
    "editModal"
  ).classList.add(
    "hidden"
  );

}


function updateEditReturnDateVisibility(){

  const status=
    document.getElementById(
      "editStatus"
    ).value;

  const group=
    document.getElementById(
      "editReturnDateGroup"
    );

  const input=
    document.getElementById(
      "editReturnDate"
    );

  if(status==="returned"){

    group.classList.remove(
      "hidden"
    );

    input.disabled=false;

    if(!input.value){

      input.value=
        getTodayEastern();

    }

  }else{

    group.classList.add(
      "hidden"
    );

    input.disabled=true;

    input.value="";

  }

}


async function saveEditedCheckout(){

  if(!editingCheckoutId)
    return;

  const checkoutDate=
    document.getElementById(
      "editCheckoutDate"
    ).value;

  const status=
    document.getElementById(
      "editStatus"
    ).value;

  const returnDate=
    document.getElementById(
      "editReturnDate"
    ).value;

  if(!checkoutDate){

    alert(
      "Please enter a checkout date."
    );

    return;

  }

  if(
    status==="returned"&&
    !returnDate
  ){

    alert(
      "Please enter a return date."
    );

    return;

  }

  const button=
    document.getElementById(
      "saveEditButton"
    );

  button.disabled=true;

  button.textContent=
    "Saving...";

  try{

    const updateData={

      "Check Out Date":
        `${checkoutDate}T12:00:00`,

      "Return Date":
        status==="returned"
          ? `${returnDate}T12:00:00`
          : null

    };

    const {error}=
      await supabaseClient
        .from("Checkouts")
        .update(updateData)
        .eq(
          "id",
          editingCheckoutId
        );

    if(error)
      throw error;

    closeEditCheckout();

    await loadData();

    if(
      currentStudentHistoryStudentId
    ){

      showStudentHistory(
        currentStudentHistoryStudentId
      );

    }

  }catch(error){

    console.error(
      "Edit checkout error:",
      error
    );

    alert(
      "Could not save the changes. Please try again."
    );

  }finally{

    button.disabled=false;

    button.textContent=
      "Save Changes";

  }

}


/* ============================================================
   DELETE CHECKOUT
============================================================ */

async function deleteCheckout(checkoutId){

  const checkout=
    checkouts.find(
      c=>String(c.id)===
        String(checkoutId)
    );

  if(!checkout)
    return;

  const student=
    getStudent(
      checkout.student_id
    );

  const book=
    getBookTitle(
      checkout.book_id
    );

  const studentText=
    student
      ? `Student #${student.student_number}`
      : "this student";

  const confirmed=
    confirm(
      `Delete this checkout record?\n\nBook: ${book}\nStudent: ${studentText}\n\nThis cannot be undone.`
    );

  if(!confirmed)
    return;

  try{

    const {error}=
      await supabaseClient
        .from("Checkouts")
        .delete()
        .eq(
          "id",
          checkoutId
        );

    if(error)
      throw error;

    await loadData();

    if(
      currentStudentHistoryStudentId
    ){

      showStudentHistory(
        currentStudentHistoryStudentId
      );

    }

  }catch(error){

    console.error(
      "Delete checkout error:",
      error
    );

    alert(
      "Could not delete the checkout record. Please try again."
    );

  }

}


/* ============================================================
   CURRENTLY CHECKED OUT
============================================================ */

function renderCheckedOut(){

  const tbody=
    document.getElementById(
      "checkedOutTableBody"
    );

  tbody.innerHTML="";

  const activeCheckouts=
    checkouts.filter(
      c=>!c["Return Date"]
    );

  if(activeCheckouts.length===0){

    tbody.innerHTML=
      '<tr><td colspan="5">No books are currently checked out.</td></tr>';

    return;

  }

  activeCheckouts.forEach(
    checkout=>{

      const student=
        getStudent(
          checkout.student_id
        );

      const book=
        books.find(
          b=>String(b.id)===
            String(checkout.book_id)
        );

      const className=
        student
          ? getClassName(
              student.class_id
            )
          : "";

      const row=
        document.createElement(
          "tr"
        );

      row.innerHTML=`

        <td>
          ${book?book.Title:"Unknown Book"}
        </td>

        <td>
          ${
            student
              ? `Student #${student.student_number}`
              : "Unknown Student"
          }
        </td>

        <td>${className}</td>

        <td>
          ${formatDate(
            checkout["Check Out Date"]
          )}
        </td>

        <td>

          <div class="history-actions">

            <button
              class="edit-button"
              onclick="openEditCheckout(${checkout.id})"
            >
              Edit
            </button>

            <button
              class="return-button"
              onclick="returnBook(${checkout.id})"
            >
              Return
            </button>

            <button
              class="delete-button"
              onclick="deleteCheckout(${checkout.id})"
            >
              Delete
            </button>

          </div>

        </td>

      `;

      tbody.appendChild(
        row
      );

    }
  );

}


/* ============================================================
   HISTORY
============================================================ */

function renderHistory(){

  const tbody=
    document.getElementById(
      "historyTableBody"
    );

  const search=
    document.getElementById(
      "historySearch"
    ).value
      .toLowerCase()
      .trim();

  tbody.innerHTML="";

  let filteredCheckouts=
    [...checkouts];

  if(search){

    filteredCheckouts=
      filteredCheckouts.filter(
        checkout=>{

          const student=
            getStudent(
              checkout.student_id
            );

          const book=
            books.find(
              b=>String(b.id)===
                String(checkout.book_id)
            );

          const className=
            student
              ? getClassName(
                  student.class_id
                )
              : "";

          const studentText=
            student
              ? `student ${student.student_number}`
              : "";

          const bookText=
            book
              ? book.Title
              : "";

          const authorText=
            book
              ? book.Author||""
              : "";

          const combined=
            `${bookText} ${authorText} ${studentText} ${className}`
              .toLowerCase();

          return combined.includes(
            search
          );

        }
      );

  }

  if(filteredCheckouts.length===0){

    tbody.innerHTML=
      '<tr><td colspan="6">No checkout history found.</td></tr>';

    return;

  }

  filteredCheckouts.forEach(
    checkout=>{

      const student=
        getStudent(
          checkout.student_id
        );

      const book=
        books.find(
          b=>String(b.id)===
            String(checkout.book_id)
        );

      const className=
        student
          ? getClassName(
              student.class_id
            )
          : "";

      const returned=
        Boolean(
          checkout["Return Date"]
        );

      const row=
        document.createElement(
          "tr"
        );

      row.innerHTML=`

        <td>
          ${book?book.Title:"Unknown Book"}
        </td>

        <td>
          ${
            student
              ? `Student #${student.student_number}`
              : "Unknown Student"
          }
        </td>

        <td>${className}</td>

        <td>
          ${formatDate(
            checkout["Check Out Date"]
          )}
        </td>

        <td>
          ${
            returned
              ? formatDate(
                  checkout["Return Date"]
                )
              : "—"
          }
        </td>

        <td>

          ${
            returned
              ? '<span class="history-status-returned">Returned</span>'
              : '<span class="history-status-out">Checked Out</span>'
          }

        </td>

      `;

      tbody.appendChild(
        row
      );

    }
  );

}


/* ============================================================
   NAVIGATION
============================================================ */

function showPage(pageId){

  document.querySelectorAll(
    ".page"
  ).forEach(page=>{

    page.classList.remove(
      "active"
    );

  });

  document.querySelectorAll(
    ".nav-button"
  ).forEach(button=>{

    button.classList.remove(
      "active"
    );

  });

  const page=
    document.getElementById(
      pageId
    );

  if(page)
    page.classList.add(
      "active"
    );

  const activeButton=
    document.querySelector(
      `.nav-button[data-page="${pageId}"]`
    );

  if(activeButton)
    activeButton.classList.add(
      "active"
    );

  if(pageId==="checkout")
    populateBooks();

  if(pageId==="library")
    renderLibrary();

  if(pageId==="students")
    renderStudents();

  if(pageId==="checkedout")
    renderCheckedOut();

  if(pageId==="history")
    renderHistory();

}


/* ============================================================
   LOGIN
============================================================ */

async function login(){

  const email=
    document.getElementById(
      "email"
    ).value.trim();

  const password=
    document.getElementById(
      "password"
    ).value;

  const errorElement=
    document.getElementById(
      "loginError"
    );

  errorElement.textContent="";

  if(!email||!password){

    errorElement.textContent=
      "Please enter your email and password.";

    return;

  }

  const button=
    document.getElementById(
      "loginButton"
    );

  button.disabled=true;

  button.textContent=
    "Logging in...";

  const {error}=
    await supabaseClient.auth.signInWithPassword({

      email,
      password

    });

  if(error){

    console.error(
      "Login error:",
      error
    );

    errorElement.textContent=
      "Incorrect email or password.";

    button.disabled=false;

    button.textContent=
      "Log In";

    return;

  }

  localStorage.setItem(
    LOGIN_TIME_KEY,
    String(Date.now())
  );

  await showApp();

}


async function showApp(){

  document.getElementById(
    "loginScreen"
  ).classList.add(
    "hidden"
  );

  document.getElementById(
    "app"
  ).classList.remove(
    "hidden"
  );

  await loadData();

}


async function logout(){

  await supabaseClient.auth.signOut();

  localStorage.removeItem(
    LOGIN_TIME_KEY
  );

  document.getElementById(
    "app"
  ).classList.add(
    "hidden"
  );

  document.getElementById(
    "loginScreen"
  ).classList.remove(
    "hidden"
  );

  document.getElementById(
    "password"
  ).value="";

}


/* ============================================================
   8-HOUR LOGIN CHECK
============================================================ */

async function checkExistingSession(){

  const {
    data:{session}
  }=
    await supabaseClient.auth.getSession();

  if(!session){

    localStorage.removeItem(
      LOGIN_TIME_KEY
    );

    return;

  }

  const storedLoginTime=
    localStorage.getItem(
      LOGIN_TIME_KEY
    );

  if(!storedLoginTime){

    localStorage.setItem(
      LOGIN_TIME_KEY,
      String(Date.now())
    );

    await showApp();

    return;

  }

  const loginTime=
    Number(storedLoginTime);

  const elapsed=
    Date.now()-loginTime;

  if(elapsed>=LOGIN_DURATION){

    localStorage.removeItem(
      LOGIN_TIME_KEY
    );

    await supabaseClient.auth.signOut();

    document.getElementById(
      "app"
    ).classList.add(
      "hidden"
    );

    document.getElementById(
      "loginScreen"
    ).classList.remove(
      "hidden"
    );

    return;

  }

  await showApp();

}


checkExistingSession();


/* ============================================================
   EVENT LISTENERS
============================================================ */

document.getElementById(
  "loginButton"
).addEventListener(
  "click",
  login
);


document.getElementById(
  "password"
).addEventListener(
  "keydown",
  event=>{

    if(event.key==="Enter")
      login();

  }
);


document.getElementById(
  "logoutButton"
).addEventListener(
  "click",
  logout
);


document.querySelectorAll(
  ".nav-button"
).forEach(button=>{

  button.addEventListener(
    "click",
    ()=>{
      showPage(
        button.dataset.page
      );
    }
  );

});


document.getElementById(
  "classSelect"
).addEventListener(
  "change",
  populateStudents
);


document.getElementById(
  "studentSelect"
).addEventListener(
  "change",
  ()=>{

    populateBooks();

    updateCheckoutButton();

  }
);


document.getElementById(
  "bookSelect"
).addEventListener(
  "focus",
  ()=>{

    populateBooks();

    document.getElementById(
      "bookDropdownList"
    ).classList.remove(
      "hidden"
    );

  }
);


document.getElementById(
  "bookSelect"
).addEventListener(
  "input",
  ()=>{

    selectedBookId="";

    populateBooks();

    document.getElementById(
      "bookDropdownList"
    ).classList.remove(
      "hidden"
    );

    updateCheckoutButton();

  }
);


document.getElementById(
  "checkoutButton"
).addEventListener(
  "click",
  checkoutBook
);


document.getElementById(
  "librarySearch"
).addEventListener(
  "input",
  renderLibrary
);


document.getElementById(
  "studentSearch"
).addEventListener(
  "input",
  renderStudents
);


document.getElementById(
  "historySearch"
).addEventListener(
  "input",
  renderHistory
);


document.addEventListener(
  "click",
  event=>{

    const dropdown=
      document.querySelector(
        ".book-dropdown"
      );

    if(
      dropdown&&
      !dropdown.contains(
        event.target
      )
    ){

      document.getElementById(
        "bookDropdownList"
      ).classList.add(
        "hidden"
      );

    }

  }
);


document.querySelectorAll(
  ".student-tab"
).forEach(tab=>{

  tab.addEventListener(
    "click",
    ()=>{

      selectedStudentClass=
        tab.dataset.class;

      document.getElementById(
        "studentSearch"
      ).value="";

      renderStudents();

    }
  );

});


document.getElementById(
  "backToStudentsButton"
).addEventListener(
  "click",
  ()=>{
    showPage(
      "students"
    );
  }
);


/* ============================================================
   EDIT CHECKOUT EVENTS
============================================================ */

document.getElementById(
  "editStatus"
).addEventListener(
  "change",
  updateEditReturnDateVisibility
);


document.getElementById(
  "saveEditButton"
).addEventListener(
  "click",
  saveEditedCheckout
);


document.getElementById(
  "cancelEditButton"
).addEventListener(
  "click",
  closeEditCheckout
);


document.getElementById(
  "editModal"
).addEventListener(
  "click",
  event=>{

    if(event.target.id==="editModal")
      closeEditCheckout();

  }
);


/* ============================================================
   BOOK EVENTS
============================================================ */

document.getElementById(
  "addBookButton"
).addEventListener(
  "click",
  openAddBook
);


document.getElementById(
  "bookTitleInput"
).addEventListener(
  "input",
  ()=>{

    selectedExistingBookId=null;

    document.getElementById(
      "bookModalMessage"
    ).innerHTML="";

    renderBookSearchResults();

  }
);


document.getElementById(
  "bookTitleInput"
).addEventListener(
  "keydown",
  event=>{

    if(event.key==="Enter"){

      event.preventDefault();

      const matches=
        findTitleMatches(
          document.getElementById(
            "bookTitleInput"
          ).value
        );

      if(matches.length>0){

        selectExistingBookForAdd(
          matches[0].book.id
        );

      }else{

        showNewBookForm();

      }

    }

  }
);


document.getElementById(
  "quickAddNewBookButton"
).addEventListener(
  "click",
  showNewBookForm
);


document.getElementById(
  "backToBookSearchButton"
).addEventListener(
  "click",
  returnToBookSearch
);


document.getElementById(
  "saveNewBookButton"
).addEventListener(
  "click",
  ()=>{

    if(editingBookId){

      saveEditedBook();

    }else{

      saveNewBook();

    }

  }
);


document.getElementById(
  "cancelNewBookButton"
).addEventListener(
  "click",
  closeBookModal
);


document.getElementById(
  "cancelBookButton"
).addEventListener(
  "click",
  closeBookModal
);


document.getElementById(
  "newBookCategoryInput"
).addEventListener(
  "change",
  updateNewBookCategoryFields
);


document.getElementById(
  "bookModal"
).addEventListener(
  "click",
  event=>{

    if(event.target.id==="bookModal")
      closeBookModal();

  }
);
