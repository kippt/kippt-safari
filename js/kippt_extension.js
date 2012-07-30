jQuery(function() {
  var Kippt = {};

  Kippt.closePopover = function() {
    setTimeout(function() {
      safari.extension.popovers[0].hide();
    }, 0);
  };

  Kippt.openTab = function(url) {
    safari.application.activeBrowserWindow.openTab().url = url;
    Kippt.closePopover();
  };

  Kippt.updateLists = function(data) {
    $("#id_list").html("");
    $.each(data, function() {
      $("#id_list").append(new Option(this.title, this.id, true, true));
    });
    $("#id_list option").first().attr("selected", "selected");
  };

  Kippt.spinnerOptions = {
    lines: 9,
    length: 2,
    width: 2,
    radius: 3,
    rotate: 0,
    color: "#111",
    speed: 1,
    trail: 27,
    shadow: false,
    hwaccel: false,
    className: "spinner",
    zIndex: 2e9,
    top: "auto",
    left: "auto"
  };

  Kippt.spinner = new Spinner(Kippt.spinnerOptions).spin();

  Kippt.popoverHandler = function() {
    Kippt.existingClip = {};

    $(".existing a").hide();
    $(".existing").show();
    $(".existing .loading").html($(Kippt.spinner.el).clone());

    var tab = safari.application.activeBrowserWindow.activeTab;
    Kippt.url = tab.url;

    // Open Kippt's Inbox if it's an empty page
    if (!tab.url) {
      tab.url = "https://kippt.com/inbox";
      Kippt.closePopover();
      return;
    }

    // Clear fields if not on the same page anymore
    if (tab.url !== Kippt.previousUrl) {
      $("#id_title").val(tab.title.trim());
      $("#id_notes").val("");
      Kippt.previousUrl = tab.url;
    }

    // Authentication check and connected services
    $.getJSON("https://kippt.com/api/account/?include_data=services&disable_basic_auth=1")
    .done(function(data) {
      Kippt.profilePath = data.app_url;

      $.each(data.services, function(name, connected) {
        $("#kippt-actions ." + name).toggleClass("connected", connected);

        var input = $("#kippt-actions ." + name + " input");
        if (connected) {
          input.removeAttr("disabled");
        }
        else {
          input.attr("disabled", "disabled");
        }
      });
    })
    .fail(function() {
      Kippt.openTab("https://kippt.com/login/");
    });

    // Check for existing clip
    $.getJSON("https://kippt.com/api/clips/?include_data=list&url=" + escape(tab.url))
    .done(function(data) {
      $(".existing .loading").html("");
      if (data.meta.total_count > 0) {
        Kippt.existingClip = data.objects[0];
        $(".existing a").css("display", "inline-block");
      }
    });

    // Populate lists from local storage
    var listCache = localStorage.getItem("kipptListCache");
    if (listCache) {
      Kippt.updateLists(JSON.parse(localStorage.getItem("kipptListCache")));
    }

    // Fetch latest lists
    $.getJSON("https://kippt.com/api/lists/?limit=0")
    .done(function(data) {
      var lists = data.objects,
          listJSON = JSON.stringify(lists);

      if (listJSON !== listCache) {
        Kippt.updateLists(lists);
        localStorage.setItem("kipptListCache", listJSON);
      }
    });
  };

  // Edit existing clip
  $(document).on("click", ".existing a", function(event) {
    event.preventDefault();
    $("#id_title").val(Kippt.existingClip.title);
    $("#id_notes").val(Kippt.existingClip.notes);
    $("#id_list option[value="+Kippt.existingClip.list.id+"]").attr("selected", "selected");
    $(".existing").hide();
  });

  // Save clip
  $(document).on("click", "#submit_clip", function() {
    var services = $.map($(".share:checked"), function(element) {
      return $(element).data("service");
    });

    var data = {
      id: Kippt.existingClip.id,
      url: Kippt.url,
      title: $("#id_title").val(),
      notes: $("#id_notes").val(),
      list: $("#id_list option:selected").val(),
      source: "safari_v1.0",
      share: services
    };

    console.log(data);

    $.post("https://kippt.com/api/clips/", JSON.stringify(data));

    Kippt.closePopover();
  });

  // Connect a service to share
  $(document).on("click", "#kippt-actions > div:not(.connected)", function() {
    Kippt.openTab("https://kippt.com/accounts/settings/connections/");
    Kippt.closePopover();
  });

  // Open profile page
  $(document).on("click", "#open-profile", function() {
    if (Kippt.profilePath !== undefined) {
      Kippt.openTab("https://kippt.com" + Kippt.profilePath);
    }
  });

  // Open inbox page
  $(document).on("click", "#open-inbox", function() {
    Kippt.openTab("https://kippt.com/inbox");
  });

  $(document).on("change", "#kippt-actions input[type=checkbox]", function() {
    var text = $(".share:checked").length ? "Save & share" : "Save";
    $("#submit_clip").val(text);
  });

  // Configure share tooltips
  $("#kippt-actions > div").tipsy({
    gravity: "sw",
    title: function() {
      var el = $(this);
      if (el.hasClass("connected")) {
        return "Share on " + el.attr("data-service-name");
      }
      else {
        return "Click to connect with " + el.attr("data-service-name");
      }
    }
  });

  safari.application.addEventListener("popover", Kippt.popoverHandler, true);
});
