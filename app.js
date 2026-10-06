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


/* Book currently selected during quick-add */

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
  }).format(new Date(year,month-1,day));

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

  const activeCheckouts=checkouts.filter(c=>
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
      .filter(word=>word&&!ignoredWords.has(word))
  );

}


function stringSimilarity(first,second){

  const a=normalizeBookText(first);

  const b=normalizeBookText(second);

  if(!a&&!b)
    return 1;

  if(!a||!b)
    return 0;

  if(a===b)
    return 1;

  const rows=a.length+1;

  const columns=b.length+1;

  const matrix=[];


  for(let i=0;i<rows;i++){

    matrix[i]=new Array(columns).fill(0);

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
    Math.max(a.length,b.length);

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
        stringSimilarity(word,otherWord)>=.78
      ){

        matchingWords++;

        break;

      }

    }

  });


  const coverageOfEnteredTitle=
    matchingWords/firstWords.size;

  const coverageOfExistingTitle=
    matchingWords/secondWords.size;


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


/*
  Returns the best matching books for the title currently
  being typed.

  This is deliberately title-focused because at this stage
  the teacher has NOT filled out the author/category fields.
*/

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


    /*
      Search matching is slightly more forgiving than the
      final duplicate check because the user is still typing.
    */

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
   QUICK ADD BOOK
============================================================ */

function renderBookSearchResults(){

  const area=
    document.getElementById(
      "bookSearchResults"
    );


  const title=
    document.getElementById(
      "bookTitleInput"
    ).value.trim();


  selectedExistingBookId=null;


  area.innerHTML="";


  if(!title){

    return;

  }


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

  area.appendChild(
    label
  );


  matches.forEach(match=>{

    const book=
      match.book;


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
      book.Author
        ? book.Author
        : "";


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
      `${Number(book.Copies||0)} ${Number(book.Copies||0)===1?"copy":"copies"} in library`;


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

  box.appendChild(
    title
  );


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
    `You currently have ${Number(book.Copies||0)} ${Number(book.Copies||0)===1?"copy":"copies"} in your library.`;


  details.innerHTML=
    detailText;


  box.appendChild(
    details
  );


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
    ()=>{
      addCopiesToSelectedBook();
    }
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

      document.getElementById(
        "bookSearchResults"
      ).innerHTML="";

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


  if(category==="Series"){

    seriesGroup.classList.remove("hidden");

    numberGroup.classList.remove("hidden");

  }else{

    seriesGroup.classList.add("hidden");

    numberGroup.classList.add("hidden");


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
    copies
  };

}


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
          `"${exactMatch.Title}" is already in your library.\n\nWould you like to add ${data.copies} more ${data.copies===1?"copy":"copies"} to that existing book instead?`
        );


      if(confirmed){

        const newCopies=
          Number(exactMatch.Copies||0)+
          data.copies;


        const {error}=
          await supabaseClient
            .from("Books")
            .update({
              "Copies":newCopies
            })
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

    const {error}=
      await supabaseClient
        .from("Books")
        .insert({

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

          "Copies":data.copies

        });


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
      "Could not save the book. Please make sure the Books permissions were added in Supabase.",
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

  const totalBooks=books.reduce(
    (total,book)=>
      total+Number(book.Copies||0),
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
      document.createElement("option");


    option.value=
      classItem.id;


    option.textContent=
      getClassName(classItem.id);


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
    students.filter(student=>
      String(student.class_id)===String(classId)
    );


  classStudents.forEach(student=>{

    const option=
      document.createElement("option");


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
    ).value.toLowerCase().trim();


  return books.filter(book=>{

    if(getAvailableCopies(book)<=0)
      return false;


    if(!search)
      return true;


    const title=
      String(book.Title||"").toLowerCase();


    const author=
      String(book.Author||"").toLowerCase();


    const series=
      String(book.Series||"").toLowerCase();


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
      b=>String(b.id)===String(bookId)
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

          student_id:Number(studentId),

          book_id:Number(bookId)

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


  const search=
    document.getElementById(
      "librarySearch"
    ).value.toLowerCase().trim();


  const filteredBooks=
    books.filter(book=>{
